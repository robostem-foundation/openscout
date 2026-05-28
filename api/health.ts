import type { IncomingMessage, ServerResponse } from "node:http";

// Diagnostic endpoint. If GET /api/health returns JSON, Vercel serverless
// functions are being detected/deployed. If it 404s, functions aren't being
// built for this project at all (a project/config issue, not a code issue).
export default function handler(_req: IncomingMessage, res: ServerResponse) {
  res.statusCode = 200;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({ ok: true, ts: Date.now() }));
}
