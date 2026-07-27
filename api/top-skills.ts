// Vercel serverless function: GET /api/top-skills?program=v5rc&grade=hs
//
// Returns the single #1 world-skills row for that program + grade (see
// server/topSkills.ts for why the trimming has to happen server-side).
// vercel.json routes /api/top-skills here, before the /api/:path* catch-all.

import "dotenv/config";
import type { IncomingMessage, ServerResponse } from "node:http";
import { isTopSkillsGrade, isTopSkillsProgram, programRunsGrade, resolveTopSkills } from "../server/topSkills.js";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "", "http://localhost");
  const program = url.searchParams.get("program");
  const grade = url.searchParams.get("grade");

  res.setHeader("content-type", "application/json");
  if (!isTopSkillsProgram(program) || !isTopSkillsGrade(grade) || !programRunsGrade(program, grade)) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: "program must be v5rc|viqrc and grade a level that program runs (hs|ms|es)" }));
    return;
  }

  try {
    const result = await resolveTopSkills(program, grade);
    res.statusCode = 200;
    // Scores only move during events, and every viewer sees the same row, so let
    // the edge answer nearly all of the traffic.
    res.setHeader("cache-control", "public, s-maxage=600, stale-while-revalidate=3600");
    res.end(JSON.stringify(result));
  } catch (err) {
    console.error("[top-skills] handler error:", err);
    res.statusCode = 502;
    res.end(JSON.stringify({ error: "Failed to load world skills leaderboard" }));
  }
}
