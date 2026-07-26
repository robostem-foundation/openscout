// Translates short public strings (event / team / organization / venue / division
// names) to English, cache-first.
//
// Where the data comes from:
//   * MyMemory (api.mymemory.translated.net) is the only translation API that is
//     free with no account and no card on file. Anonymous callers get 5,000
//     words/day per IP; setting MYMEMORY_EMAIL raises that to 50,000.
//   * It does NOT auto-detect the source language — `langpair` requires an
//     explicit source — which is why callers must supply one. See src/lib/lang.ts.
//
// Cost control: a VEX event's name never changes, so every successful translation
// is persisted to Supabase (`translations`) and never fetched twice. The corpus is
// finite, so the quota is effectively a one-time cost per unique string across all
// users. Chrome clients translate on-device and never reach this module at all.

import { createHash } from "node:crypto";
import { supabaseConfig, supabaseHeaders } from "./supabaseRest.js";
import { translationKey } from "../src/lib/lang.js";

export type TranslateRequest = { text: string; sourceLang: string };

const MYMEMORY_BASE = process.env.MYMEMORY_API_BASE ?? "https://api.mymemory.translated.net/get";

// MyMemory hard-rejects a longer `q`. Nothing in scope is close to this, and
// silently truncating a name is worse than not translating it, so over-long
// strings are dropped before the call rather than trimmed.
const MAX_SOURCE_CHARS = 500;

// How many uncached strings one request may translate. Caps how much of the daily
// quota a single page view can burn; anything above the cap is simply left
// untranslated and retried on the next call.
const MAX_TRANSLATIONS_PER_REQUEST = 12;
const TRANSLATE_CONCURRENCY = 4;

// The API returns its errors as the translation itself, with responseStatus 200.
const ERROR_PROSE = /MYMEMORY WARNING|QUERY LENGTH LIMIT|INVALID SOURCE LANGUAGE|INVALID TARGET LANGUAGE|IS AN INVALID/i;

/** sha256 of the cache key, hex. Matches the `hash` primary key in migration 0010. */
export function translationHash(text: string, sourceLang: string): string {
  return createHash("sha256").update(translationKey(text, sourceLang)).digest("hex");
}

/**
 * Pull a usable translation out of a MyMemory response, or null if the response
 * is a failure in any of its several disguises. Pure and total: never throws,
 * whatever shape the payload turns out to be.
 */
export function parseMyMemory(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const body = payload as {
    responseData?: { translatedText?: unknown };
    responseStatus?: unknown;
    quotaFinished?: unknown;
  };

  // responseStatus arrives as a number on success and sometimes as a string on
  // failure, so compare loosely rather than trusting the type.
  if (String(body.responseStatus) !== "200") return null;
  if (body.quotaFinished === true) return null;

  const raw = body.responseData?.translatedText;
  if (typeof raw !== "string") return null;
  const translated = raw.trim();
  if (!translated) return null;
  if (ERROR_PROSE.test(translated)) return null;

  return translated;
}

/** Thrown to abandon the rest of a batch once the daily quota is gone. */
class QuotaExhausted extends Error {}

async function translateOne(text: string, sourceLang: string): Promise<string | null> {
  const params = new URLSearchParams({ q: text, langpair: `${sourceLang}|en` });
  const email = process.env.MYMEMORY_EMAIL;
  if (email) params.set("de", email);

  const res = await fetch(`${MYMEMORY_BASE}?${params.toString()}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`mymemory: HTTP ${res.status}`);

  const payload = (await res.json()) as { quotaFinished?: unknown };
  if (payload?.quotaFinished === true) throw new QuotaExhausted("mymemory: daily quota exhausted");

  const translated = parseMyMemory(payload);
  if (!translated) return null;
  // An unchanged string means the engine had nothing to offer. Caching it would
  // permanently mark a translatable name as untranslatable, so treat it as a miss.
  if (translated === text.trim()) return null;
  return translated;
}

// ── Supabase cache (service-role key for writes: bypasses RLS, server-only) ───

type CachedRow = { hash: string; translated_text: string };

async function readCache(hashes: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const config = supabaseConfig("read", "translate");
  if (!config || !hashes.length) return out;

  const list = hashes.map((hash) => `"${hash}"`).join(",");
  const url = `${config.url}/rest/v1/translations?select=hash,translated_text&hash=in.(${encodeURIComponent(list)})`;
  const res = await fetch(url, { headers: supabaseHeaders(config.key), signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`translations read: HTTP ${res.status}`);

  for (const row of (await res.json()) as CachedRow[]) out.set(row.hash, row.translated_text);
  return out;
}

async function writeCache(
  rows: Array<{ hash: string; text: string; sourceLang: string; translated: string }>,
): Promise<void> {
  const config = supabaseConfig("write", "translate");
  if (!config || !rows.length) return;

  const res = await fetch(`${config.url}/rest/v1/translations?on_conflict=hash`, {
    method: "POST",
    headers: {
      ...supabaseHeaders(config.key),
      "content-type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(
      rows.map((row) => ({
        hash: row.hash,
        source_text: row.text,
        source_lang: row.sourceLang,
        target_lang: "en",
        translated_text: row.translated,
        engine: "mymemory",
      })),
    ),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`translations write: HTTP ${res.status} ${await res.text()}`);
}

// ── Public entry point ───────────────────────────────────────────────────────

/**
 * English for the given strings, cache-first.
 *
 * Returns a map keyed by `translationKey(text, sourceLang)`. Anything that could
 * not be translated — over-long, engine failure, quota exhausted, or beyond this
 * request's cap — is simply ABSENT from the result. Callers render the original
 * and the next call retries it; nothing is negatively cached, so today's quota
 * exhaustion must not suppress a translation permanently.
 */
export async function resolveTranslations(requests: TranslateRequest[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};

  // Dedupe: one page can render the same organization name in a dozen rows.
  const unique = new Map<string, TranslateRequest>();
  for (const request of requests) {
    const text = (request.text ?? "").trim();
    const sourceLang = (request.sourceLang ?? "").trim();
    if (!text || !sourceLang || text.length > MAX_SOURCE_CHARS) continue;
    unique.set(translationKey(text, sourceLang), { text, sourceLang });
  }
  if (!unique.size) return out;

  const hashes = new Map<string, string>(); // cache key -> hash
  for (const [key, request] of unique) hashes.set(key, translationHash(request.text, request.sourceLang));

  let cached = new Map<string, string>();
  try {
    cached = await readCache([...hashes.values()]);
  } catch (err) {
    console.error("[translate] cache read failed:", err);
  }
  for (const [key, hash] of hashes) {
    const hit = cached.get(hash);
    if (hit) out[key] = hit;
  }

  const missing = [...unique.keys()]
    .filter((key) => !(key in out))
    .slice(0, MAX_TRANSLATIONS_PER_REQUEST);
  if (!missing.length) return out;

  const fresh: Array<{ hash: string; text: string; sourceLang: string; translated: string }> = [];
  const queue = [...missing];
  let quotaGone = false;

  await Promise.all(
    Array.from({ length: Math.min(TRANSLATE_CONCURRENCY, queue.length) }, async () => {
      for (let key = queue.shift(); key; key = queue.shift()) {
        if (quotaGone) return;
        const request = unique.get(key);
        if (!request) continue;
        try {
          const translated = await translateOne(request.text, request.sourceLang);
          if (!translated) continue;
          out[key] = translated;
          fresh.push({ hash: hashes.get(key)!, ...request, translated });
        } catch (err) {
          if (err instanceof QuotaExhausted) {
            // Every remaining call would fail identically — stop burning them.
            quotaGone = true;
            console.warn("[translate] daily MyMemory quota exhausted; abandoning batch");
            return;
          }
          // Leave it untranslated: the caller shows the original and we retry later.
          console.error("[translate]", err instanceof Error ? err.message : err);
        }
      }
    }),
  );

  try {
    await writeCache(fresh);
  } catch (err) {
    console.error("[translate] cache write failed:", err);
  }
  return out;
}
