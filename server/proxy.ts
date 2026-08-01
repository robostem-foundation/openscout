// Shared upstream-proxy logic used by both the local Express dev server
// (server/index.ts) and the Vercel serverless function (api/[...path].ts).
// Environment variables are read lazily (per request) so it works whether
// they come from dotenv (local) or Vercel's injected env (production).

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

export const PROXY_SOURCES = ["rse", "re", "re-root", "jumper"] as const;
export type ProxySource = (typeof PROXY_SOURCES)[number];

export function isProxySource(value: string): value is ProxySource {
  return (PROXY_SOURCES as readonly string[]).includes(value);
}

function trimSlash(value: string) {
  return value.replace(/\/$/, "");
}

function upstreamUrl(source: ProxySource, endpoint: string, query: string) {
  switch (source) {
    case "rse":
      return `${trimSlash(process.env.ROBOSTEM_API_BASE ?? "https://robostem-api.org")}/api/v3/${endpoint}${query}`;
    case "re":
      return `${trimSlash(process.env.ROBOTEVENTS_API_BASE ?? "https://events.vex.com/api/v2")}/${endpoint}${query}`;
    case "re-root":
      return `${trimSlash(process.env.ROBOTEVENTS_ROOT_BASE ?? "https://events.vex.com")}/${endpoint}${query}`;
    case "jumper":
      return `${trimSlash(process.env.JUMPER_API_BASE ?? "https://jumper.robostem.org")}/api/${endpoint}${query}`;
  }
}

function upstreamHeaders(source: ProxySource, accept: string): Record<string, string> {
  if (source === "rse") {
    return { "X-API-Key": process.env.RSE_API_KEY ?? "", Accept: accept };
  }
  if (source === "re" || source === "re-root") {
    return { Authorization: `Bearer ${process.env.ROBOTEVENTS_API_KEY ?? ""}`, Accept: "application/json" };
  }
  return { Accept: "application/json" };
}

// `public` + `s-maxage` lets the Vercel edge CDN cache one upstream response per
// URL and serve every concurrent viewer from it, so live-event polling load on
// the shared API key does NOT scale with audience size. All proxied data is
// public (no per-user content), so shared caching is safe. `max-age` keeps the
// browser cache short enough that 30s polls still see fresh data.
const CACHE_CONTROL: Record<ProxySource, string> = {
  rse: "public, max-age=15, s-maxage=30, stale-while-revalidate=120",
  re: "public, max-age=15, s-maxage=30, stale-while-revalidate=120",
  "re-root": "public, max-age=300, stale-while-revalidate=600",
  jumper: "public, max-age=30, s-maxage=30, stale-while-revalidate=120",
};

export type ProxyResult = {
  status: number;
  contentType: string;
  cacheControl: string;
  body: string;
};

export async function proxyRequest(
  source: ProxySource,
  endpoint: string,
  query: string,
  accept = "application/json",
): Promise<ProxyResult> {
  const upstream = await fetch(upstreamUrl(source, endpoint, query), {
    headers: upstreamHeaders(source, accept),
  });

  return {
    status: upstream.status,
    contentType: upstream.headers.get("content-type") ?? "application/json",
    cacheControl: CACHE_CONTROL[source],
    body: await upstream.text(),
  };
}

// ---------------------------------------------------------------------------
// Abuse protection: Origin/Referer allowlist + per-IP rate limiting.
// The proxy attaches secret upstream API keys to every request, so without a
// guard anyone who finds the deployed URL can drive it as a free public relay
// (quota/cost abuse — not key theft; the key value never reaches the browser).
// Both guards degrade to no-ops when unconfigured so local dev is unaffected.
// ---------------------------------------------------------------------------

function hostOf(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).host;
  } catch {
    return null;
  }
}

// APP_ORIGIN is a comma-separated allowlist of full origins. When it is unset,
// origin enforcement is DISABLED (allow-all) so a missing env var can never take
// production down — the per-IP rate limit is the backstop in that case.
function allowedHosts(): Set<string> | null {
  const configured = (process.env.APP_ORIGIN ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (configured.length === 0) return null; // enforcement disabled
  const hosts = new Set<string>();
  for (const origin of configured) {
    const h = hostOf(origin);
    if (h) hosts.add(h);
  }
  // Always tolerate local dev hosts alongside a configured production origin.
  hosts.add("localhost:5173");
  hosts.add("localhost:5175");
  return hosts;
}

/**
 * True if the request may use the proxy. Same-origin browser GETs omit `Origin`
 * but send `Referer`, so either matching the allowlist is accepted. A request
 * with neither header (e.g. a raw script) is rejected once APP_ORIGIN is set.
 */
export function isAllowedOrigin(headers: { origin?: string | null; referer?: string | null }): boolean {
  const allow = allowedHosts();
  if (allow === null) return true; // enforcement disabled
  const originHost = hostOf(headers.origin);
  if (originHost) return allow.has(originHost);
  const refererHost = hostOf(headers.referer);
  if (refererHost) return allow.has(refererHost);
  return false;
}

let cachedLimiter: Ratelimit | null | undefined;
function getLimiter(): Ratelimit | null {
  if (cachedLimiter !== undefined) return cachedLimiter;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    cachedLimiter = null; // no Upstash configured (e.g. local dev) → no-op
    return null;
  }
  cachedLimiter = new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(60, "10 s"),
    prefix: "proxy",
    analytics: false,
  });
  return cachedLimiter;
}

export type GuardResult =
  | { ok: true }
  | { ok: false; status: number; message: string; retryAfter?: number };

/**
 * Combined proxy guard: rejects disallowed origins (403) and IPs over the rate
 * limit (429). Both checks are skipped when their env config is absent, so
 * `npm run dev` works with no extra setup.
 */
export async function guardProxyRequest(input: {
  origin?: string | null;
  referer?: string | null;
  ip: string;
}): Promise<GuardResult> {
  if (!isAllowedOrigin(input)) {
    return { ok: false, status: 403, message: "Forbidden: origin not allowed" };
  }
  const limiter = getLimiter();
  if (limiter) {
    const { success, reset } = await limiter.limit(input.ip);
    if (!success) {
      const retryAfter = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
      return { ok: false, status: 429, message: "Too many requests", retryAfter };
    }
  }
  return { ok: true };
}

/**
 * Apply `guardProxyRequest` to a bare Node request/response pair and answer it
 * on rejection. Returns false when the response has already been sent and the
 * caller should stop.
 *
 * Used by the feature endpoints under `api/` (event-info, event-grades,
 * top-skills, spotlight-events), which were previously unguarded — leaving the
 * metered cors.sh quota and the multi-MB skills board open to unthrottled use.
 */
export async function guardNodeRequest(
  req: { headers: Record<string, string | string[] | undefined> },
  res: { statusCode: number; setHeader(name: string, value: string): void; end(body?: string): void },
): Promise<boolean> {
  const header = (name: string): string | null => {
    const value = req.headers[name];
    return (Array.isArray(value) ? value[0] : value) ?? null;
  };
  const guard = await guardProxyRequest({
    origin: header("origin"),
    referer: header("referer"),
    ip: clientIpFromForwardedFor(req.headers["x-forwarded-for"]),
  });
  if (guard.ok) return true;
  res.statusCode = guard.status;
  if (guard.retryAfter) res.setHeader("retry-after", String(guard.retryAfter));
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({ message: guard.message }));
  return false;
}

/** Extract the client IP from an x-forwarded-for header value (first hop). */
export function clientIpFromForwardedFor(value: string | string[] | null | undefined, fallback = "unknown"): string {
  const raw = Array.isArray(value) ? value[0] : value;
  const first = (raw ?? "").split(",")[0]?.trim();
  return first || fallback;
}
