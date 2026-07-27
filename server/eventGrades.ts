// Resolves an event's grade level(s) — the one piece of event metadata RobotEvents
// does not expose through any API.
//
// Where the data comes from:
//   * `events.vex.com/api/v2/events` returns no grade field, and ignores
//     `grade_level` / `grade_level[]` / `grade` params (identical result totals).
//     The RoboSTEM mirror returns the same shape.
//   * Every public event page server-renders one line — "Grade Level: Elementary"
//     / "Middle School" / "High School" / "All" — which matches the structured
//     `grade_level_id` filter on the program listing pages. That line is the source.
//
// Cost control: events.vex.com sits behind Cloudflare, so the page has to come
// through a CORS proxy on a metered monthly quota. Grade level is fixed at event
// creation, so every successful scrape is persisted to Supabase (`event_grades`)
// and never fetched twice. Only V5RC and VIQRC are scraped at all — VURC and
// VAIRC events have an unambiguous span, so spending a request on them is waste.

import { supabaseConfig, supabaseHeaders } from "./supabaseRest.js";

const CORS_PROXY = "https://proxy.cors.sh/";
const EVENTS_VEX_BASE = process.env.ROBOTEVENTS_ROOT_BASE ?? "https://events.vex.com";

// Grade span per program id, low → high. Used to expand a "Grade Level: All"
// page (blended event) and to decide which programs are worth a request.
const PROGRAM_SPAN: Record<number, string[]> = {
  1: ["MS", "HS"], // V5RC
  41: ["ES", "MS"], // VIQRC
  4: ["U"], // VURC
  57: ["HS", "U"], // VAIRC
};
const SCRAPED_PROGRAMS = new Set([1, 41]);

export type EventGradeRow = { sku: string; grades: string[]; label?: string | null };

function programSlug(sku: string): string {
  if (/VIQ/i.test(sku)) return "vex-iq-competition";
  return "vex-robotics-competition";
}

function eventPageUrl(sku: string): string {
  return `${EVENTS_VEX_BASE}/robot-competitions/${programSlug(sku)}/${encodeURIComponent(sku)}.html`;
}

// The line lives inside the event partner's General Info block, so the value can
// be wrapped in inline tags or padded with &nbsp;. Take the first text run after
// the label and stop at the next tag or newline.
const GRADE_LINE = /Grade\s*Level\s*:?\s*(?:<[^>]*>\s*)*([^<\n]{1,60})/i;

/** Map a scraped label to canonical codes, expanding "All" via the program span. */
export function gradeLabelToCodes(label: string, programId: number | null): string[] {
  const span = (programId != null && PROGRAM_SPAN[programId]) || [];
  // The scraped line is full of &nbsp; (U+00A0) — normalise before matching.
  const value = label.replace(/\u00a0/g, " ").trim().toLowerCase();
  if (!value) return [];
  if (/^all\b/.test(value)) return [...span];

  const codes: string[] = [];
  if (/elementary/.test(value)) codes.push("ES");
  if (/middle/.test(value)) codes.push("MS");
  if (/high\s*school/.test(value)) codes.push("HS");
  if (/college|university/.test(value)) codes.push("U");
  // Order low → high, and never claim a grade the program doesn't run.
  const order = ["ES", "MS", "HS", "U"];
  const filtered = span.length ? codes.filter((code) => span.includes(code)) : codes;
  return filtered.sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

/** True when scraping this event could tell us something its program doesn't already. */
export function gradeIsScrapable(programId: number | null): boolean {
  return programId != null && SCRAPED_PROGRAMS.has(programId);
}

// cors.sh rejects a live key without an Origin header ("Live key requires a
// browser Origin"). We send it server-side, so it just has to be a single valid
// origin — it does not have to match where this code is running, which is why
// local dev works the same as production. APP_ORIGIN is a comma-separated
// allowlist, so only its first entry is usable here; CORS_SH_ORIGIN overrides.
const FALLBACK_PROXY_ORIGIN = "https://openscout.ing";
function proxyOrigin(): string {
  const candidates = [process.env.CORS_SH_ORIGIN, (process.env.APP_ORIGIN ?? "").split(",")[0]];
  for (const candidate of candidates) {
    const value = (candidate ?? "").trim();
    if (/^https?:\/\/[^/\s,]+$/.test(value)) return value;
  }
  return FALLBACK_PROXY_ORIGIN;
}

/**
 * Fetch any events.vex.com page through the CORS proxy. Exported because the
 * Spotlight-tier lookup (server/spotlightEvents.ts) needs the same treatment —
 * the site is behind Cloudflare, so a direct server fetch gets challenged.
 * `label` only shapes the error message.
 */
export async function fetchVexPage(url: string, label = url): Promise<string> {
  const key = process.env.CORS_SH_API_KEY;
  const res = await fetch(`${CORS_PROXY}${url}`, {
    headers: {
      Origin: proxyOrigin(),
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      ...(key ? { "x-cors-api-key": key } : {}),
    },
    signal: AbortSignal.timeout(15000),
  });
  const html = await res.text();
  if (!res.ok) throw new Error(`${label}: HTTP ${res.status}`);
  if (html.length < 500 || html.includes("Just a moment...")) throw new Error(`${label}: challenged`);
  return html;
}

function fetchEventPage(sku: string): Promise<string> {
  return fetchVexPage(eventPageUrl(sku), `event page ${sku}`);
}

// ── Supabase cache (service-role key: bypasses RLS, server-only) ──────────────

async function readCache(skus: string[]): Promise<EventGradeRow[]> {
  const config = supabaseConfig("read", "event-grades");
  if (!config || !skus.length) return [];
  const list = skus.map((sku) => `"${sku}"`).join(",");
  const query = `${config.url}/rest/v1/event_grades?select=sku,grades,grade_label&sku=in.(${encodeURIComponent(list)})`;
  const res = await fetch(query, {
    headers: supabaseHeaders(config.key),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`event_grades read: HTTP ${res.status}`);
  const rows = (await res.json()) as Array<{ sku: string; grades: string[]; grade_label: string | null }>;
  return rows.map((row) => ({ sku: row.sku, grades: row.grades ?? [], label: row.grade_label }));
}

async function writeCache(rows: Array<EventGradeRow & { programId: number | null }>): Promise<void> {
  const config = supabaseConfig("write", "event-grades");
  if (!config || !rows.length) return;
  const res = await fetch(`${config.url}/rest/v1/event_grades?on_conflict=sku`, {
    method: "POST",
    headers: {
      ...supabaseHeaders(config.key),
      "content-type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(
      rows.map((row) => ({
        sku: row.sku,
        program_id: row.programId,
        grades: row.grades,
        grade_label: row.label ?? null,
      })),
    ),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`event_grades write: HTTP ${res.status} ${await res.text()}`);
}

// ── Public entry point ───────────────────────────────────────────────────────

// How many uncached events one request may scrape. Keeps the response fast and
// puts a hard ceiling on how much of the monthly proxy quota a single page view
// can burn; anything above the cap is simply left unknown for the next call.
const MAX_SCRAPES_PER_REQUEST = 8;
const SCRAPE_CONCURRENCY = 4;

/**
 * Grade codes for the given events, cache-first.
 *
 * `requests` carries the program id per SKU because "All" can only be expanded
 * with it. Unknown/failed events are simply absent from the result — callers fall
 * back to the program span, and the next call retries them.
 */
export async function resolveEventGrades(
  requests: Array<{ sku: string; programId: number | null }>,
): Promise<Record<string, string[]>> {
  const scrapable = requests.filter((entry) => entry.sku && gradeIsScrapable(entry.programId));
  const byS = new Map(scrapable.map((entry) => [entry.sku, entry.programId] as const));
  const out: Record<string, string[]> = {};
  if (!byS.size) return out;

  let cached: EventGradeRow[] = [];
  try {
    cached = await readCache([...byS.keys()]);
  } catch (err) {
    console.error("[event-grades] cache read failed:", err);
  }
  cached.forEach((row) => {
    out[row.sku] = row.grades;
  });

  const missing = [...byS.keys()].filter((sku) => !(sku in out)).slice(0, MAX_SCRAPES_PER_REQUEST);
  if (!missing.length) return out;

  const fresh: Array<EventGradeRow & { programId: number | null }> = [];
  const queue = [...missing];
  await Promise.all(
    Array.from({ length: Math.min(SCRAPE_CONCURRENCY, queue.length) }, async () => {
      for (let sku = queue.shift(); sku; sku = queue.shift()) {
        try {
          const html = await fetchEventPage(sku);
          const label = html.match(GRADE_LINE)?.[1]?.trim();
          if (!label) throw new Error(`event page ${sku}: no grade line`);
          const programId = byS.get(sku) ?? null;
          const grades = gradeLabelToCodes(label, programId);
          if (!grades.length) throw new Error(`event page ${sku}: unmapped label "${label}"`);
          out[sku] = grades;
          fresh.push({ sku, grades, label, programId });
        } catch (err) {
          // Leave it unknown: the caller shows the program span and we retry later.
          console.error("[event-grades]", err instanceof Error ? err.message : err);
        }
      }
    }),
  );

  try {
    await writeCache(fresh);
  } catch (err) {
    console.error("[event-grades] cache write failed:", err);
  }
  return out;
}
