import type { IncomingMessage, ServerResponse } from "node:http";

// Vercel serverless function that proxies every /api/* request to the upstream
// VEX/RoboStem/Jumper APIs, keeping the secret keys server-side.
//
// NOTE: this intentionally inlines the proxy logic instead of importing
// server/proxy.ts. Vercel's function bundler does not reliably trace imports
// from outside the /api directory, which caused the function to drop out of the
// deployment (so /api/* fell through to the SPA rewrite and returned index.html).
// Keep this in sync with server/proxy.ts (used by the local Express dev server).

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

const CACHE_CONTROL: Record<ProxySource, string> = {
  rse: "private, max-age=45",
  re: "private, max-age=60",
  "re-root": "private, max-age=300",
  jumper: "private, max-age=60",
};

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const rawUrl = req.url ?? "";
  const queryIndex = rawUrl.indexOf("?");
  const pathPart = queryIndex >= 0 ? rawUrl.slice(0, queryIndex) : rawUrl;
  const query = queryIndex >= 0 ? rawUrl.slice(queryIndex) : "";

  // Strip an optional leading "/api/" then split into [source, ...endpoint].
  const segments = pathPart.replace(/^\/(api\/)?/, "").split("/");
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
    const upstream = await fetch(upstreamUrl(source, endpoint, query), {
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
