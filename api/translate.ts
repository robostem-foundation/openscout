// Vercel serverless function: POST /api/translate
//
// Body: { items: [{ text, sourceLang }] }  — sourceLang comes from the client's
// resolveSourceLang() so both engines agree on it (MyMemory cannot auto-detect).
// Returns { translations: { "<sourceLang>\n<text>": "<english>" } } for everything
// it could resolve; anything else is omitted and the client renders the original.
// See server/translate.ts for the data source and why results are persisted.
// vercel.json routes /api/translate here, before the /api/:path* catch-all.

import "dotenv/config";
import type { IncomingMessage, ServerResponse } from "node:http";
import { clientIpFromForwardedFor, guardProxyRequest } from "../server/proxy.js";
import { resolveTranslations, type TranslateRequest } from "../server/translate.js";

// One page of rows at most — the client only asks about strings it is rendering.
const MAX_ITEMS = 60;

export function parseTranslateBody(raw: unknown): TranslateRequest[] {
  if (!raw || typeof raw !== "object") return [];
  const items = (raw as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];

  return items
    .slice(0, MAX_ITEMS)
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const { text, sourceLang } = item as { text?: unknown; sourceLang?: unknown };
      if (typeof text !== "string" || typeof sourceLang !== "string") return null;
      const trimmedText = text.trim();
      const trimmedLang = sourceLang.trim();
      if (!trimmedText || !trimmedLang) return null;
      // Language tags only: `xx` or `xx-YY`. Keeps anything odd out of the
      // upstream URL and out of the cache key.
      if (!/^[a-z]{2}(-[A-Za-z]{2})?$/.test(trimmedLang)) return null;
      return { text: trimmedText, sourceLang: trimmedLang };
    })
    .filter((entry): entry is TranslateRequest => entry !== null);
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    // Sixty short names is a few kilobytes; anything larger is not our client.
    if (size > 64 * 1024) throw new Error("body too large");
    chunks.push(buffer);
  }
  if (!chunks.length) return null;
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader("content-type", "application/json");

  if (req.method !== "POST") {
    res.statusCode = 405;
    res.end(JSON.stringify({ error: "POST required" }));
    return;
  }

  // Same abuse guard as the proxy: without it this is an open relay against the
  // shared MyMemory quota.
  const guard = await guardProxyRequest({
    origin: (req.headers.origin as string) ?? null,
    referer: (req.headers.referer as string) ?? null,
    authorization: (req.headers.authorization as string) ?? null,
    ip: clientIpFromForwardedFor(req.headers["x-forwarded-for"], req.socket.remoteAddress ?? "unknown"),
  });
  if (!guard.ok) {
    if (guard.retryAfter) res.setHeader("retry-after", String(guard.retryAfter));
    res.statusCode = guard.status;
    res.end(JSON.stringify({ message: guard.message }));
    return;
  }

  let items: TranslateRequest[];
  try {
    items = parseTranslateBody(await readJsonBody(req));
  } catch {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: "Invalid JSON body" }));
    return;
  }

  if (!items.length) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: "items array is required ({ text, sourceLang })" }));
    return;
  }

  try {
    const translations = await resolveTranslations(items);
    res.statusCode = 200;
    // A name's translation is as stable as its grade level. POST responses are
    // not edge-cached, but the header is correct and any intermediary that
    // honors it should.
    res.setHeader("cache-control", "public, s-maxage=86400, stale-while-revalidate=604800");
    res.end(JSON.stringify({ translations }));
  } catch (err) {
    console.error("[translate] handler error:", err);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: "Failed to resolve translations" }));
  }
}
