// Vercel serverless function: GET /api/event-info?sku=RE-V5RC-26-4244
// Scrapes agenda and webcast info from events.vex.com for the given event SKU.
// Vercel.json routes /api/event-info directly here (before the /api/:path* catch-all).

import "dotenv/config";
import type { IncomingMessage, ServerResponse } from "node:http";
import { scrapeEventInfo } from "../server/eventInfoScraper.js";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const parsed = new URL(req.url ?? "", "http://localhost");
  const sku = parsed.searchParams.get("sku") ?? "";

  if (!sku) {
    res.statusCode = 400;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "sku query param is required" }));
    return;
  }

  try {
    const data = await scrapeEventInfo(sku);
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.setHeader("cache-control", "s-maxage=3600, stale-while-revalidate=86400");
    res.end(JSON.stringify(data));
  } catch (err) {
    console.error("[event-info] handler error:", err);
    res.statusCode = 500;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "Failed to fetch event info" }));
  }
}
