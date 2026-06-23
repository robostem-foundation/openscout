import type { IncomingMessage, ServerResponse } from "node:http";

// Proxies every /api/* request to the upstream VEX/RoboStem/Jumper APIs,
// keeping secret keys server-side.
//
// Vercel does NOT match a filesystem catch-all ([...path].ts) for this
// (non-Next.js) project, but it does deploy normally-named functions. So
// vercel.json rewrites /api/:path* -> /api/proxy?__p=:path* (original query is
// merged in by Vercel), and this function reconstructs the upstream request
// from __p + the remaining query params.
//
// Keep the proxy logic in sync with server/proxy.ts (local Express dev server).

type ProxySource = "rse" | "re" | "re-root" | "jumper";

function isProxySource(value: string): value is ProxySource {
  return value === "rse" || value === "re" || value === "re-root" || value === "jumper";
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

// Keep in sync with server/proxy.ts. `public` + `s-maxage` lets the Vercel edge
// CDN serve every concurrent viewer of a live event from one cached upstream
// response, so polling load on the shared API key does not scale with audience.
// All proxied data is public; `max-age` keeps the browser fresh for 30s polls.
const CACHE_CONTROL: Record<ProxySource, string> = {
  rse: "public, max-age=15, s-maxage=30, stale-while-revalidate=120",
  re: "public, max-age=15, s-maxage=30, stale-while-revalidate=120",
  "re-root": "public, max-age=300, stale-while-revalidate=600",
  jumper: "public, max-age=30, s-maxage=30, stale-while-revalidate=120",
};

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const parsed = new URL(req.url ?? "", "http://localhost");
  const rawPath = parsed.searchParams.get("__p") ?? "";
  parsed.searchParams.delete("__p");
  const query = parsed.searchParams.toString();
  const queryString = query ? `?${query}` : "";

  const segments = rawPath.split("/").filter(Boolean);
  const source = segments.shift() ?? "";
  const endpoint = segments.join("/");

  if (!isProxySource(source)) {
    res.statusCode = 404;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ message: "Unknown proxy source" }));
    return;
  }

  const accept = source === "rse" ? (req.headers.accept ?? "application/json") : "application/json";

  try {
    const upstream = await fetch(upstreamUrl(source, endpoint, queryString), {
      headers: upstreamHeaders(source, accept),
    });
    const body = await upstream.text();

    res.statusCode = upstream.status;
    res.setHeader("content-type", upstream.headers.get("content-type") ?? "application/json");
    res.setHeader("cache-control", CACHE_CONTROL[source]);
    res.end(body);
  } catch (error) {
    console.error(`${source} proxy failed`, error);
    res.statusCode = 502;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ message: "Upstream API request failed" }));
  }
}
