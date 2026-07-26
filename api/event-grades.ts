// Vercel serverless function: GET /api/event-grades?sku=RE-V5RC-26-4244:1,RE-VIQRC-26-4508:41
//
// Each item is `SKU:programId` — the program is needed to expand a "Grade Level:
// All" page into that program's grade span. Returns `{ grades: { sku: ["MS","HS"] } }`
// for everything it could resolve; unresolved SKUs are omitted (the client falls
// back to the program span). See server/eventGrades.ts for the data source and
// why results are persisted.
// vercel.json routes /api/event-grades here, before the /api/:path* catch-all.

import "dotenv/config";
import type { IncomingMessage, ServerResponse } from "node:http";
import { resolveEventGrades } from "../server/eventGrades.js";

// One page of events at most — the client only asks about rows it is rendering.
const MAX_ITEMS = 40;

export function parseSkuParam(raw: string): Array<{ sku: string; programId: number | null }> {
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, MAX_ITEMS)
    .map((item) => {
      const [sku, program] = item.split(":");
      const programId = Number(program);
      return { sku: sku.trim(), programId: Number.isFinite(programId) ? programId : null };
    })
    .filter((entry) => /^RE-[A-Z0-9]+-\d\d-\d+$/i.test(entry.sku));
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const parsed = new URL(req.url ?? "", "http://localhost");
  const requests = parseSkuParam(parsed.searchParams.get("sku") ?? "");

  res.setHeader("content-type", "application/json");
  if (!requests.length) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: "sku query param is required (comma-separated SKU:programId)" }));
    return;
  }

  try {
    const grades = await resolveEventGrades(requests);
    res.statusCode = 200;
    // Grade level never changes once an event exists, so let the edge keep it.
    res.setHeader("cache-control", "public, s-maxage=86400, stale-while-revalidate=604800");
    res.end(JSON.stringify({ grades }));
  } catch (err) {
    console.error("[event-grades] handler error:", err);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: "Failed to resolve event grades" }));
  }
}
