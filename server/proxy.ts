// Shared upstream-proxy logic used by both the local Express dev server
// (server/index.ts) and the Vercel serverless function (api/[...path].ts).
// Environment variables are read lazily (per request) so it works whether
// they come from dotenv (local) or Vercel's injected env (production).

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

const CACHE_CONTROL: Record<ProxySource, string> = {
  rse: "private, max-age=45",
  re: "private, max-age=60",
  "re-root": "private, max-age=300",
  jumper: "private, max-age=60",
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
