// Vercel serverless function: GET /api/spotlight-events
//
// Returns `{ skus: [...] }` for every Spotlight-tier event in the current
// seasons. See server/spotlightEvents.ts for why this can't come from the
// RobotEvents API (Spotlight events report level "World", same as Worlds).
// vercel.json routes /api/spotlight-events here, before the /api/:path* catch-all.

import "dotenv/config";
import type { IncomingMessage, ServerResponse } from "node:http";
import { resolveSpotlightEvents } from "../server/spotlightEvents.js";
import { currentSeasonByProgram } from "../server/topSkills.js";

export default async function handler(_req: IncomingMessage, res: ServerResponse) {
  res.setHeader("content-type", "application/json");
  try {
    const result = await resolveSpotlightEvents(await currentSeasonByProgram());
    res.statusCode = 200;
    // The tier of an existing event never changes; only new events can join the
    // list, so the edge may hold this for hours.
    res.setHeader("cache-control", "public, s-maxage=21600, stale-while-revalidate=86400");
    res.end(JSON.stringify(result));
  } catch (err) {
    console.error("[spotlight-events] handler error:", err);
    res.statusCode = 502;
    res.end(JSON.stringify({ error: "Failed to resolve Spotlight events" }));
  }
}
