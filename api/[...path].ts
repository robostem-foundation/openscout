import type { IncomingMessage, ServerResponse } from "node:http";
import { isProxySource, proxyRequest } from "../server/proxy.js";

// Vercel serverless function that mirrors the local Express proxy
// (server/index.ts). It catches every /api/* request, derives the upstream
// "source" (rse | re | re-root | jumper) from the first path segment, and
// forwards the rest of the path + query string to the shared proxy.
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
    const result = await proxyRequest(source, endpoint, query, accept);
    res.statusCode = result.status;
    res.setHeader("content-type", result.contentType);
    res.setHeader("cache-control", result.cacheControl);
    res.end(result.body);
  } catch (error) {
    console.error(`${source} proxy failed`, error);
    res.statusCode = 502;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ message: "Upstream API request failed" }));
  }
}
