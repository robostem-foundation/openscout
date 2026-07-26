# Auto-translate Non-English Names Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show English for non-English event, team, organization, venue, and division names, with the original one click away — using only free translation engines.

**Architecture:** A shared, dependency-free language resolver (`src/lib/lang.ts`) decides whether a string needs translating and what its source language is. The client tries Chrome's on-device `Translator` API first, falling back to `POST /api/translate`, which reads a shared Supabase cache and calls MyMemory's free API only on a miss. Every UI string renders through one `<TranslatedText>` component whose icon color signals which version you are reading.

**Tech Stack:** React 19, TypeScript, Vite 7, Express 5 (dev) / Vercel functions (prod), Supabase PostgREST, `motion`, `lucide-react`, `radix-ui` tooltip, vitest (new).

**Spec:** `docs/superpowers/specs/2026-07-25-auto-translate-design.md`

## Global Constraints

- **No paid services and no service requiring a card on file.** MyMemory anonymous tier and Chrome's on-device model only.
- **Every failure degrades to showing the original text with no icon.** Nothing in the app may break or block on translation.
- **`src/lib/lang.ts` must have zero imports.** It is imported by both the browser bundle and the Node server; any dependency would cross that boundary.
- **Anonymous clients never write to Supabase.** The `translations` table gets no insert policy; only the server writes, with `SUPABASE_SECRET_KEY`.
- **On-device (Chrome) results cache in `localStorage` only** — never sent to the shared table.
- **Returning `null` from `resolveSourceLang` means "do not translate."** Every uncertain case resolves to `null`.
- **In-scope fields only:** `Event.name`, `Team.team_name`, `Team.organization`, `Event.location.venue`, `Division.name`. Do not touch the Event Info body, award names, city/region names, or user-authored notes.
- Existing files use 2-space indent, double quotes, no semicolon-free style. Match `server/eventGrades.ts` and `src/settings.ts` for comment density — these files explain *why*, not *what*.

---

### Task 1: Shared language resolver + test runner

**Files:**
- Create: `src/lib/lang.ts`
- Create: `src/lib/lang.test.ts`
- Modify: `package.json` (add `vitest` devDependency and `test` script)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `resolveSourceLang(text: string, country?: string | null): string | null`
  - `shouldTranslate(text: string | null | undefined, country?: string | null): boolean`
  - `translationKey(text: string, sourceLang: string): string`

The repo has no test runner today. This task adds one, scoped to the pure logic where a bug is invisible in the UI.

- [ ] **Step 1: Install vitest**

```bash
npm install -D vitest@^3
```

- [ ] **Step 2: Add the test script**

In `package.json`, inside `"scripts"`, add after the `"lint"` entry:

```json
    "test": "vitest run"
```

Vitest reads the existing `vite.config.ts` automatically; no separate config file is needed.

- [ ] **Step 3: Write the failing test**

Create `src/lib/lang.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveSourceLang, shouldTranslate, translationKey } from "./lang";

describe("resolveSourceLang — script wins over country", () => {
  it("detects Japanese from kana even when Han is also present", () => {
    expect(resolveSourceLang("東京ロボット大会", "Japan")).toBe("ja");
  });

  it("detects Korean from hangul", () => {
    expect(resolveSourceLang("서울 로봇 대회", "Korea, Republic of")).toBe("ko");
  });

  it("treats bare Han as Simplified by default", () => {
    expect(resolveSourceLang("北京机器人大赛", "China")).toBe("zh-CN");
  });

  it("treats bare Han as Traditional in Taiwan, Hong Kong and Macau", () => {
    expect(resolveSourceLang("台北機器人大賽", "Taiwan")).toBe("zh-TW");
    expect(resolveSourceLang("香港機器人大賽", "Hong Kong")).toBe("zh-TW");
  });

  it("defaults Cyrillic to Russian but honors a more specific country", () => {
    expect(resolveSourceLang("Кубок роботов", "Russian Federation")).toBe("ru");
    expect(resolveSourceLang("Кубок роботів", "Ukraine")).toBe("uk");
  });

  it("detects the remaining scripts", () => {
    expect(resolveSourceLang("بطولة الروبوت", "Egypt")).toBe("ar");
    expect(resolveSourceLang("การแข่งขันหุ่นยนต์", "Thailand")).toBe("th");
    expect(resolveSourceLang("Διαγωνισμός ρομπότ", "Greece")).toBe("el");
    expect(resolveSourceLang("תחרות רובוטים", "Israel")).toBe("he");
    expect(resolveSourceLang("रोबोट प्रतियोगिता", "India")).toBe("hi");
  });

  it("trusts script even when the country disagrees", () => {
    // A Chinese-named event hosted in the US is still Chinese text.
    expect(resolveSourceLang("上海邀请赛", "United States")).toBe("zh-CN");
  });
});

describe("resolveSourceLang — Latin script falls back to country", () => {
  it("maps non-English countries to their language", () => {
    expect(resolveSourceLang("Torneo de Robótica", "Mexico")).toBe("es");
    expect(resolveSourceLang("Torneio de Robótica", "Brazil")).toBe("pt");
    expect(resolveSourceLang("Tournoi de Robotique", "France")).toBe("fr");
    expect(resolveSourceLang("Roboter Wettbewerb", "Germany")).toBe("de");
    expect(resolveSourceLang("Robot Turnuvası", "Turkey")).toBe("tr");
  });

  it("accepts ISO-2 country codes as well as full names", () => {
    expect(resolveSourceLang("Torneo de Robótica", "MX")).toBe("es");
  });

  it("returns null for English-speaking countries", () => {
    expect(resolveSourceLang("Spring Qualifier", "United States")).toBeNull();
    expect(resolveSourceLang("Spring Qualifier", "Canada")).toBeNull();
  });

  it("returns null for multi-language countries rather than guessing", () => {
    expect(resolveSourceLang("Robot Cup", "Switzerland")).toBeNull();
    expect(resolveSourceLang("Robot Cup", "Belgium")).toBeNull();
  });

  it("returns null when there is no country to fall back on", () => {
    expect(resolveSourceLang("Torneo de Robótica", null)).toBeNull();
    expect(resolveSourceLang("Torneo de Robótica", undefined)).toBeNull();
    expect(resolveSourceLang("Torneo de Robótica", "")).toBeNull();
  });

  it("returns null for an unrecognized country", () => {
    expect(resolveSourceLang("Robot Cup", "Atlantis")).toBeNull();
  });
});

describe("shouldTranslate", () => {
  it("is true when a source language resolves", () => {
    expect(shouldTranslate("北京机器人大赛", "China")).toBe(true);
  });

  it("is false for empty, whitespace, and single-character input", () => {
    expect(shouldTranslate("", "China")).toBe(false);
    expect(shouldTranslate("   ", "China")).toBe(false);
    expect(shouldTranslate("中", "China")).toBe(false);
    expect(shouldTranslate(null, "China")).toBe(false);
    expect(shouldTranslate(undefined, "China")).toBe(false);
  });

  it("is false for strings with no letters at all", () => {
    expect(shouldTranslate("2026 — ???", "China")).toBe(false);
    expect(shouldTranslate("1234", "China")).toBe(false);
  });

  it("is false for identifiers: team numbers and SKUs", () => {
    expect(shouldTranslate("1234A", "China")).toBe(false);
    expect(shouldTranslate("RE-V5RC-26-4244", "China")).toBe(false);
  });

  it("is true for an all-caps multi-word name, which is not an identifier", () => {
    expect(shouldTranslate("COLEGIO SAN JOSE", "Mexico")).toBe(true);
  });

  it("is false when the source language is unresolvable", () => {
    expect(shouldTranslate("Spring Qualifier", "United States")).toBe(false);
  });
});

describe("translationKey", () => {
  it("joins language and text with a newline", () => {
    expect(translationKey("北京", "zh-CN")).toBe("zh-CN\n北京");
  });

  it("distinguishes the same text under different source languages", () => {
    expect(translationKey("Robot", "es")).not.toBe(translationKey("Robot", "pt"));
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npx vitest run src/lib/lang.test.ts`
Expected: FAIL — `Failed to resolve import "./lang"`.

- [ ] **Step 5: Implement `src/lib/lang.ts`**

```ts
// Shared language resolution for the translation feature.
//
// This module is deliberately free of imports. The browser bundle uses it for
// the "does this string need translating" gate, and server/translate.ts imports
// it (`../src/lib/lang.js`) to build MyMemory's `langpair` — MyMemory does NOT
// auto-detect a source language, so the server needs exactly the same answer the
// client computed. Adding a dependency here would drag it across that boundary.
//
// The governing rule everywhere below: when in doubt, return null. A missed
// translation is a far cheaper failure than a mangled proper noun or a wasted
// request against a 5,000-word/day quota.

// --- script detection --------------------------------------------------------

// Kana is checked before Han because Japanese text is usually a mix of both;
// hangul likewise. Only text with no kana and no hangul is treated as Chinese.
const RE_KANA = /[぀-ヿ]/;
const RE_HANGUL = /[가-힯ᄀ-ᇿ㄰-㆏]/;
const RE_HAN = /[㐀-䶿一-鿿豈-﫿]/;
const RE_CYRILLIC = /[Ѐ-ӿ]/;
const RE_ARABIC = /[؀-ۿݐ-ݿ]/;
const RE_THAI = /[฀-๿]/;
const RE_GREEK = /[Ͱ-Ͽἀ-῿]/;
const RE_HEBREW = /[֐-׿]/;
const RE_DEVANAGARI = /[ऀ-ॿ]/;

const RE_LETTER = /\p{L}/u;
// A team number ("1234A") or SKU ("RE-V5RC-26-4244"): upper-case/digit tokens
// joined by hyphens, no spaces. The no-spaces requirement is what keeps a real
// all-caps name like "COLEGIO SAN JOSE" out of this bucket.
const RE_IDENTIFIER = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;

// --- country tables ----------------------------------------------------------

// RobotEvents returns `location.country` as a full English name, but a few
// endpoints and cached records carry an ISO-2 code instead, so both are keyed.
// Keys are upper-cased; look-ups normalise the same way.

const TRADITIONAL_HAN = new Set(["TAIWAN", "TW", "HONG KONG", "HK", "MACAU", "MACAO", "MO"]);

const CYRILLIC_BY_COUNTRY: Record<string, string> = {
  UKRAINE: "uk",
  UA: "uk",
  BULGARIA: "bg",
  BG: "bg",
  SERBIA: "sr",
  RS: "sr",
};

// Latin-script fallback. Countries absent from this table resolve to null, which
// covers both English-speaking countries and genuinely multi-language ones
// (Switzerland, Belgium, Canada, India, the Philippines, Kazakhstan) where a
// guess would be wrong as often as right.
const COUNTRY_LANG: Record<string, string> = {
  CHINA: "zh-CN", CN: "zh-CN",
  TAIWAN: "zh-TW", TW: "zh-TW",
  "HONG KONG": "zh-TW", HK: "zh-TW",
  MACAU: "zh-TW", MACAO: "zh-TW", MO: "zh-TW",
  JAPAN: "ja", JP: "ja",
  "KOREA, REPUBLIC OF": "ko", "SOUTH KOREA": "ko", KOREA: "ko", KR: "ko",
  MEXICO: "es", MX: "es",
  SPAIN: "es", ES: "es",
  COLOMBIA: "es", CO: "es",
  CHILE: "es", CL: "es",
  PERU: "es", PE: "es",
  ARGENTINA: "es", AR: "es",
  ECUADOR: "es", EC: "es",
  PANAMA: "es", PA: "es",
  "COSTA RICA": "es", CR: "es",
  "DOMINICAN REPUBLIC": "es", DO: "es",
  GUATEMALA: "es", GT: "es",
  "EL SALVADOR": "es", SV: "es",
  HONDURAS: "es", HN: "es",
  PARAGUAY: "es", PY: "es",
  URUGUAY: "es", UY: "es",
  BOLIVIA: "es", BO: "es",
  VENEZUELA: "es", VE: "es",
  NICARAGUA: "es", NI: "es",
  BRAZIL: "pt", BR: "pt",
  PORTUGAL: "pt", PT: "pt",
  FRANCE: "fr", FR: "fr",
  GERMANY: "de", DE: "de",
  AUSTRIA: "de", AT: "de",
  ITALY: "it", IT: "it",
  NETHERLANDS: "nl", NL: "nl",
  TURKEY: "tr", "TÜRKIYE": "tr", TR: "tr",
  POLAND: "pl", PL: "pl",
  "RUSSIAN FEDERATION": "ru", RUSSIA: "ru", RU: "ru",
  UKRAINE: "uk", UA: "uk",
  VIETNAM: "vi", "VIET NAM": "vi", VN: "vi",
  THAILAND: "th", TH: "th",
  INDONESIA: "id", ID: "id",
  MALAYSIA: "ms", MY: "ms",
  "SAUDI ARABIA": "ar", SA: "ar",
  "UNITED ARAB EMIRATES": "ar", AE: "ar",
  EGYPT: "ar", EG: "ar",
  QATAR: "ar", QA: "ar",
  KUWAIT: "ar", KW: "ar",
  BAHRAIN: "ar", BH: "ar",
  OMAN: "ar", OM: "ar",
  JORDAN: "ar", JO: "ar",
  LEBANON: "ar", LB: "ar",
  MOROCCO: "ar", MA: "ar",
  ISRAEL: "he", IL: "he",
  GREECE: "el", GR: "el",
  "CZECH REPUBLIC": "cs", CZECHIA: "cs", CZ: "cs",
  HUNGARY: "hu", HU: "hu",
  ROMANIA: "ro", RO: "ro",
  SWEDEN: "sv", SE: "sv",
  NORWAY: "no", NO: "no",
  DENMARK: "da", DK: "da",
  FINLAND: "fi", FI: "fi",
  ICELAND: "is", IS: "is",
  SLOVAKIA: "sk", SK: "sk",
  SLOVENIA: "sl", SI: "sl",
  CROATIA: "hr", HR: "hr",
  SERBIA: "sr", RS: "sr",
  BULGARIA: "bg", BG: "bg",
};

function normalizeCountry(country?: string | null): string {
  return (country ?? "").trim().toUpperCase();
}

/**
 * The MyMemory/Chrome source-language tag for this string, or null when we
 * cannot tell — which is also the instruction not to translate it.
 *
 * Script is checked first because it is unambiguous where it applies: Chinese
 * text is Chinese wherever the event is hosted. Only Latin-script text falls
 * back to the country, which is the sole signal available for Spanish, French,
 * Portuguese, German and Turkish names.
 */
export function resolveSourceLang(text: string, country?: string | null): string | null {
  if (!text) return null;
  const cc = normalizeCountry(country);

  if (RE_KANA.test(text)) return "ja";
  if (RE_HANGUL.test(text)) return "ko";
  if (RE_HAN.test(text)) return TRADITIONAL_HAN.has(cc) ? "zh-TW" : "zh-CN";
  if (RE_CYRILLIC.test(text)) return CYRILLIC_BY_COUNTRY[cc] ?? "ru";
  if (RE_ARABIC.test(text)) return "ar";
  if (RE_THAI.test(text)) return "th";
  if (RE_GREEK.test(text)) return "el";
  if (RE_HEBREW.test(text)) return "he";
  if (RE_DEVANAGARI.test(text)) return "hi";

  return COUNTRY_LANG[cc] ?? null;
}

/**
 * Whether this string is worth sending to a translation engine. Runs three cheap
 * rejections before the language lookup so that identifiers and punctuation never
 * cost a request.
 */
export function shouldTranslate(text: string | null | undefined, country?: string | null): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  if (trimmed.length < 2) return false;
  if (!RE_LETTER.test(trimmed)) return false;
  if (RE_IDENTIFIER.test(trimmed)) return false;
  return resolveSourceLang(trimmed, country) !== null;
}

/**
 * Cache key for a translation request. Shared by the client's in-memory and
 * localStorage caches and by the server's response map, so all three agree on
 * what identifies a translation. The same text under two source languages is two
 * different translations.
 */
export function translationKey(text: string, sourceLang: string): string {
  return `${sourceLang}\n${text}`;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/lib/lang.test.ts`
Expected: PASS — all tests green.

- [ ] **Step 7: Verify the build and lint are still clean**

Run: `npm run lint && npx tsc -b`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json src/lib/lang.ts src/lib/lang.test.ts
git commit -m "feat(translate): shared language resolver, with vitest for pure logic"
```

---

### Task 2: Supabase cache table + extract the PostgREST helpers

**Files:**
- Create: `supabase/migrations/0010_translations.sql`
- Create: `server/supabaseRest.ts`
- Modify: `server/eventGrades.ts` (remove the local helpers, import them instead)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces:
  - `supabaseConfig(mode: "read" | "write", label: string): { url: string; key: string } | null`
  - `supabaseHeaders(key: string): Record<string, string>`

`server/eventGrades.ts` already contains exactly the PostgREST access helpers the
translator needs, including the non-JWT `sb_publishable_…` / `sb_secret_…` header
handling that is easy to get wrong. Copying them would mean maintaining two
versions, so lift them into a shared module first. This is a targeted extraction
of code the new work depends on — not a general refactor.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0010_translations.sql`:

```sql
-- 0010: shared translation cache.
-- Run manually in the Supabase SQL editor after 0009. Idempotent & transactional.
--
-- Non-English event/team/organization names are translated to English for
-- display. The only free engine that works in every browser (MyMemory) has a
-- 5,000-word/day anonymous quota, so every successful translation is written here
-- and never fetched again. The corpus of VEX names is finite and effectively
-- static, so steady state is a Postgres read and zero upstream traffic.
--
-- Chrome's on-device Translator results deliberately do NOT land here: anon
-- clients cannot write (see the policy note below), and mixing two engines'
-- output in one shared table would show two users different English for the
-- same name. Those results stay in the client's localStorage.
begin;

create table if not exists public.translations (
  -- sha256(source_lang || E'\n' || source_text), hex. Hashed rather than keyed on
  -- the text itself so the primary-key index can never hit Postgres' ~2704-byte
  -- btree limit on an unexpectedly long name.
  hash text primary key,
  source_text text not null,
  source_lang text not null,
  target_lang text not null default 'en',
  translated_text text not null,
  engine text not null default 'mymemory',
  created_at timestamptz not null default now()
);

alter table public.translations enable row level security;

-- Public read: every string in here is already public data rendered in a
-- signed-out view.
drop policy if exists "translations public read" on public.translations;
create policy "translations public read" on public.translations
  for select
  using (true);

-- No insert/update/delete policy on purpose: writes come from the serverless
-- translator using the service-role key, which bypasses RLS. Anon clients can
-- read the cache but cannot poison it.

commit;
```

- [ ] **Step 2: Apply the migration**

Paste the file's contents into the Supabase SQL editor and run it, the same way
`0009_event_grades.sql` was applied. Verify with:

```sql
select count(*) from public.translations;
```

Expected: `0` (the table exists and is publicly readable).

- [ ] **Step 3: Create the shared helper module**

Create `server/supabaseRest.ts`:

```ts
// PostgREST access shared by the server-side caches (event grades, translations).
//
// Extracted from server/eventGrades.ts so the two caches cannot drift on the key
// handling below, which is the part that is easy to get wrong.

// Reads only need SELECT and both cache tables have a public read policy, so the
// publishable key is enough and a cache stays useful even before the secret key
// is configured. Writes bypass RLS and require the secret key.
const warnedNoWrites = new Set<string>();

export function supabaseConfig(mode: "read" | "write", label: string) {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  const key = mode === "write" ? secretKey : (secretKey ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY);
  if (!url || !key) {
    if (mode === "write" && !warnedNoWrites.has(label)) {
      warnedNoWrites.add(label);
      // Worth shouting about: with no write path every visitor re-fetches the
      // same values against a metered upstream quota.
      console.warn(`[${label}] no SUPABASE_SECRET_KEY — results will be refetched, not persisted`);
    }
    return null;
  }
  return { url: url.replace(/\/$/, ""), key };
}

// `sb_publishable_…`/`sb_secret_…` keys are not JWTs, and Supabase only accepts
// them in the `apikey` header — so send Authorization only for a JWT key.
export function supabaseHeaders(key: string): Record<string, string> {
  const isJwt = key.startsWith("ey");
  return { apikey: key, ...(isJwt ? { Authorization: `Bearer ${key}` } : {}) };
}
```

- [ ] **Step 4: Point `eventGrades.ts` at the shared module**

In `server/eventGrades.ts`, add to the imports at the top of the file:

```ts
import { supabaseConfig, supabaseHeaders } from "./supabaseRest.js";
```

Then delete this entire block — from the `// ── Supabase cache` banner comment
down to and including the `supabaseHeaders` function (the `let warnedNoWrites`
declaration, `function supabaseConfig`, and `function supabaseHeaders`), keeping
the banner comment itself:

```ts
// ── Supabase cache (service-role key: bypasses RLS, server-only) ──────────────
```

Finally, update the two call sites to pass the new `label` argument:

```ts
const config = supabaseConfig("read", "event-grades");
```

```ts
const config = supabaseConfig("write", "event-grades");
```

- [ ] **Step 5: Verify nothing broke**

Run: `npx tsc -b && npm run lint`
Expected: no errors.

Then start the dev server and confirm the existing grades lookup still resolves:

```bash
npm run dev
```

In a second terminal:

```bash
curl -s 'http://localhost:5175/api/event-grades?sku=RE-V5RC-26-4244:1' | head -c 300
```

Expected: a JSON object of the form `{"grades":{...}}` — the same output as before
the refactor. (An empty `{"grades":{}}` is acceptable if that SKU does not exist;
what matters is a 200 with valid JSON and no Supabase key errors in the server log.)

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0010_translations.sql server/supabaseRest.ts server/eventGrades.ts
git commit -m "feat(translate): translations cache table; share the PostgREST helpers"
```

---

### Task 3: Server-side translation resolution

**Files:**
- Create: `server/translate.ts`
- Create: `server/translate.test.ts`

**Interfaces:**
- Consumes: `resolveSourceLang`, `translationKey` from `src/lib/lang.js` (Task 1); `supabaseConfig`, `supabaseHeaders` from `./supabaseRest.js` (Task 2).
- Produces:
  - `type TranslateRequest = { text: string; sourceLang: string }`
  - `parseMyMemory(payload: unknown): string | null`
  - `resolveTranslations(requests: TranslateRequest[]): Promise<Record<string, string>>` — keyed by `translationKey(text, sourceLang)`

MyMemory returns its *error prose inside the translation field with a 200 status*.
That is the single easiest thing to get wrong here, so `parseMyMemory` is written
test-first and kept pure.

- [ ] **Step 1: Write the failing test**

Create `server/translate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseMyMemory } from "./translate.js";

const ok = (translatedText: string) => ({
  responseData: { translatedText, match: 0.85 },
  responseStatus: 200,
  quotaFinished: false,
});

describe("parseMyMemory", () => {
  it("returns the translated text on a clean success", () => {
    expect(parseMyMemory(ok("Beijing Robotics Competition"))).toBe("Beijing Robotics Competition");
  });

  it("trims surrounding whitespace", () => {
    expect(parseMyMemory(ok("  Beijing Robotics Competition  "))).toBe("Beijing Robotics Competition");
  });

  it("rejects a non-200 responseStatus", () => {
    expect(parseMyMemory({ ...ok("Anything"), responseStatus: 403 })).toBeNull();
  });

  it("rejects a string responseStatus, which the API sometimes sends", () => {
    expect(parseMyMemory({ ...ok("Anything"), responseStatus: "403" })).toBeNull();
  });

  it("rejects a finished quota", () => {
    expect(parseMyMemory({ ...ok("Anything"), quotaFinished: true })).toBeNull();
  });

  it("rejects empty or whitespace-only output", () => {
    expect(parseMyMemory(ok(""))).toBeNull();
    expect(parseMyMemory(ok("   "))).toBeNull();
  });

  it("rejects the API's error prose, which arrives with a 200 status", () => {
    expect(
      parseMyMemory(ok("MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY")),
    ).toBeNull();
    expect(parseMyMemory(ok("QUERY LENGTH LIMIT EXCEEDED. MAX ALLOWED QUERY : 500 CHARS"))).toBeNull();
    expect(parseMyMemory(ok("'AUTO' IS AN INVALID SOURCE LANGUAGE"))).toBeNull();
  });

  it("rejects a malformed payload instead of throwing", () => {
    expect(parseMyMemory(null)).toBeNull();
    expect(parseMyMemory({})).toBeNull();
    expect(parseMyMemory({ responseData: {} })).toBeNull();
    expect(parseMyMemory("not json at all")).toBeNull();
  });
});
```

Note the deliberate omission: `parseMyMemory` does **not** reject output equal to
its input, because it never sees the input. That check belongs to the caller and
is applied in `resolveTranslations` (Step 3).

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run server/translate.test.ts`
Expected: FAIL — `Failed to resolve import "./translate.js"`.

- [ ] **Step 3: Implement `server/translate.ts`**

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run server/translate.test.ts`
Expected: PASS — all 9 tests green.

- [ ] **Step 5: Verify types**

Run: `npx tsc -b && npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add server/translate.ts server/translate.test.ts
git commit -m "feat(translate): cache-first MyMemory resolution"
```

---

### Task 4: The `/api/translate` endpoint

**Files:**
- Create: `api/translate.ts`
- Modify: `server/index.ts` (add the route before the proxy catch-alls)
- Modify: `vercel.json` (add a rewrite before the `/api/:path*` catch-all)
- Modify: `.env.example` (document `MYMEMORY_EMAIL`)

**Interfaces:**
- Consumes: `resolveTranslations`, `TranslateRequest` from `../server/translate.js` (Task 3); `guardProxyRequest`, `clientIpFromForwardedFor` from `../server/proxy.js` (existing).
- Produces:
  - `parseTranslateBody(raw: unknown): TranslateRequest[]`
  - HTTP: `POST /api/translate` with body `{ items: [{ text, sourceLang }] }` → `{ translations: Record<string, string> }`

This is POST rather than GET because fifty non-Latin names would blow past URL
length limits and encode badly in a query string.

- [ ] **Step 1: Create the Vercel handler**

Create `api/translate.ts`:

```ts
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
```

- [ ] **Step 2: Add the dev-server route**

In `server/index.ts`, extend the imports:

```ts
import { resolveTranslations } from "./translate.js";
import { parseTranslateBody } from "../api/translate.js";
```

Then add this route immediately **after** the existing `app.get("/api/event-grades", …)`
block and **before** the `app.get("/api/rse/*endpoint", …)` line:

```ts
// Translation lookup (cache-first MyMemory) — also before the catch-alls.
// `express.json` is mounted on this route alone rather than app-wide, so the
// existing GET proxy routes keep their current body handling.
app.post("/api/translate", express.json({ limit: "64kb" }), async (req: express.Request, res: express.Response) => {
  const guard = await guardProxyRequest({
    origin: req.headers.origin ?? null,
    referer: req.headers.referer ?? null,
    ip: clientIpFromForwardedFor(req.headers["x-forwarded-for"], req.socket.remoteAddress ?? "unknown"),
  });
  if (!guard.ok) {
    if (guard.retryAfter) res.setHeader("retry-after", String(guard.retryAfter));
    res.status(guard.status).json({ message: guard.message });
    return;
  }

  const items = parseTranslateBody(req.body);
  if (!items.length) {
    res.status(400).json({ error: "items array is required ({ text, sourceLang })" });
    return;
  }
  try {
    const translations = await resolveTranslations(items);
    res.setHeader("cache-control", "public, s-maxage=86400, stale-while-revalidate=604800");
    res.json({ translations });
  } catch (err) {
    console.error("[translate] handler error:", err);
    res.status(500).json({ error: "Failed to resolve translations" });
  }
});
```

- [ ] **Step 3: Add the Vercel rewrite**

In `vercel.json`, add a third explicit entry to `rewrites`, keeping it **above**
the `/api/:path*` catch-all:

```json
    { "source": "/api/event-info", "destination": "/api/event-info" },
    { "source": "/api/event-grades", "destination": "/api/event-grades" },
    { "source": "/api/translate", "destination": "/api/translate" },
    { "source": "/api/:path*", "destination": "/api/proxy?__p=:path*" },
```

- [ ] **Step 4: Document the new env var**

Append to `.env.example`, after the event-grades block:

```
# ── Translation (/api/translate) ──────────────────────────────────────────────
# Non-English event/team/org names are translated to English for display. Chrome
# does it on-device for free; every other browser calls MyMemory's free public
# API through this endpoint. Anonymous callers get 5,000 words/day per IP.
# Setting an email address raises that to 50,000/day — no account and no card,
# the address is just an identifier the API attributes usage to. Server-side.
#   MYMEMORY_EMAIL=
#
# Every successful translation is written to the `translations` table (migration
# 0010) and never fetched again, so the quota is a one-time cost per unique
# string across all users. That write needs SUPABASE_SECRET_KEY (same key as the
# event-grades cache); without it lookups still work, they just re-translate.
```

- [ ] **Step 5: Verify the endpoint end to end**

Run: `npx tsc -b && npm run lint`
Expected: no errors.

Start the dev server:

```bash
npm run dev
```

In a second terminal, translate a real Chinese event name:

```bash
curl -s -X POST http://localhost:5175/api/translate -H 'content-type: application/json' -d '{"items":[{"text":"北京机器人大赛","sourceLang":"zh-CN"}]}'
```

Expected: `{"translations":{"zh-CN\n北京机器人大赛":"Beijing Robot Competition"}}` — the
exact English wording will vary, but the key must match the `sourceLang\ntext`
format and the value must be English.

Then confirm the write-back landed. Run the same curl a second time and check the
server log: there must be **no** new `[translate]` MyMemory activity, and in the
Supabase SQL editor:

```sql
select source_text, source_lang, translated_text, engine from public.translations;
```

Expected: one row. If the row is missing and the log shows
`no SUPABASE_SECRET_KEY`, set that variable in `.env` and retry — the feature
works without it, but the cache is the whole cost strategy.

Finally, confirm the guards:

```bash
curl -s -X POST http://localhost:5175/api/translate -H 'content-type: application/json' -d '{"items":[]}'
curl -s http://localhost:5175/api/translate
```

Expected: a 400 `items array is required …` for the first, and a 404 from Express
for the second (the route is POST-only; on Vercel the same GET returns the
handler's 405).

- [ ] **Step 6: Commit**

```bash
git add api/translate.ts server/index.ts vercel.json .env.example
git commit -m "feat(translate): POST /api/translate endpoint with the proxy abuse guard"
```

---

### Task 5: Translate Mode setting

**Files:**
- Modify: `src/settings.ts` (new synced key, hook, and setter)
- Modify: `src/App.tsx` (Appearance tab control, around `AppearanceSettings` at line 14640)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `type TranslateMode = "auto" | "manual"`
  - `useTranslateMode(): TranslateMode`
  - `setTranslateMode(value: TranslateMode): void`

This lands before the translation client so `src/translate.ts` (Task 6) has a real
setting to read. It follows the `useTabLayout` pattern in the same file exactly.

- [ ] **Step 1: Add the synced key**

In `src/settings.ts`, add the key constant alongside the others near the top:

```ts
const TRANSLATE_MODE_KEY = "vex-translate-mode";
```

and add it to the `SYNCED_KEYS` tuple:

```ts
const SYNCED_KEYS = [EVENTS_PROGRAMS_KEY, EVENTS_FILTERS_KEY, TAB_LAYOUT_KEY, QUICK_VIEW_FIRST_KEY, QUICK_VIEW_MODE_KEY, QUICK_VIEW_SIDE_KEY, TRANSLATE_MODE_KEY] as const;
```

- [ ] **Step 2: Add the type next to `TabLayout`**

```ts
// How non-English names are handled. "auto" translates on render; "manual" makes
// zero network requests until the user clicks a string's translate icon — which
// is both the quota-saver and the "I read this language, stop rewriting my UI"
// option.
export type TranslateMode = "auto" | "manual";
```

- [ ] **Step 3: Add the hook and setter**

Append to the end of `src/settings.ts`:

```ts
// --- translate mode preference ------------------------------------------------

// Reuses the quick-view listener set: like those values, this one must notify on
// self-writes so every mounted <TranslatedText> re-renders the moment the mode
// flips — not only on a cloud load.

// Default "auto": only a stored literal "manual" turns it off, so a fresh user
// (or any unset key) gets translations.
function getTranslateMode(): TranslateMode {
  return currentValues[TRANSLATE_MODE_KEY] === "manual" ? "manual" : "auto";
}

export function useTranslateMode(): TranslateMode {
  return useSyncExternalStore(subscribeQuickViewFirst, getTranslateMode, getTranslateMode);
}

export function setTranslateMode(value: TranslateMode) {
  writeLS(TRANSLATE_MODE_KEY, value);
  const next: Values = { ...currentValues, [TRANSLATE_MODE_KEY]: value };
  if (sameValues(next, currentValues)) return;
  currentValues = next;
  if (signedIn && supabase && userId) void upsertCloud(supabase, userId, next);
  emitQuickViewFirst();
}

// Non-reactive read for module-level code (src/translate.ts consults this outside
// a React render to decide whether to fetch).
export function readTranslateMode(): TranslateMode {
  return getTranslateMode();
}
```

- [ ] **Step 4: Add the Appearance-tab control**

In `src/App.tsx`, extend the settings imports from `./settings` to include
`useTranslateMode` and `setTranslateMode`, then add this block inside
`AppearanceSettings` (line ~14640), immediately after the closing `</div>` of the
"Team click behavior" `settings-field`:

```tsx
        <div className="settings-field">
          <h3 className="settings-field-title">Translate mode</h3>
          <p className="settings-section-copy">
            Non-English event, team, and organization names can be shown in English. Either way, the translate icon
            beside a name switches it back to the original.
          </p>
          <div className="seg-toggle seg-toggle-quiet" role="group" aria-label="Translate mode">
            {TRANSLATE_MODE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={translateMode === option.value ? "active" : ""}
                onClick={() => setTranslateMode(option.value)}
                aria-pressed={translateMode === option.value}
              >
                {option.label}
                {translateMode === option.value && <SlideIndicator id="translate-mode" variant="pill" />}
              </button>
            ))}
          </div>
          <p className="onboard-hint">
            Manual makes no translation requests until you ask for one. Syncs across your devices.
          </p>
        </div>
```

Read the current value at the top of `AppearanceSettings`, beside the other hooks:

```tsx
  const translateMode = useTranslateMode(); // auto vs manual translation, synced
```

And define the options next to `SETTINGS_THEME_OPTIONS` (line ~14445):

```tsx
const TRANSLATE_MODE_OPTIONS: Array<{ value: TranslateMode; label: string }> = [
  { value: "auto", label: "Auto-translate" },
  { value: "manual", label: "Manual" },
];
```

Add `TranslateMode` to the existing `import type { … } from "./settings"` list (or
the value import, whichever the file already uses for `TabLayout`).

- [ ] **Step 5: Verify**

Run: `npx tsc -b && npm run lint`
Expected: no errors.

Then `npm run dev`, open `http://localhost:5175/settings`, and check:

1. The Appearance tab shows a **Translate mode** segmented control, defaulting to
   Auto-translate.
2. Clicking Manual slides the pill indicator across.
3. Reload the page — Manual is still selected.
4. In devtools, `localStorage.getItem("vex-translate-mode")` returns `"manual"`.
5. Signed in: flip the mode, reload, and confirm it persists; in the Supabase
   SQL editor, `select settings from user_settings;` includes
   `"vex-translate-mode": "manual"`.

- [ ] **Step 6: Commit**

```bash
git add src/settings.ts src/App.tsx
git commit -m "feat(translate): Translate Mode setting on the Appearance tab"
```

---

### Task 6: Client translation store

**Files:**
- Create: `src/translate.ts`

**Interfaces:**
- Consumes: `resolveSourceLang`, `shouldTranslate`, `translationKey` from `./lib/lang` (Task 1); `readTranslateMode`, `useTranslateMode` from `./settings` (Task 5); the `POST /api/translate` contract (Task 4).
- Produces:
  - `type TranslationStatus = "none" | "pending" | "ready" | "failed"`
  - `useTranslated(text, country?): { translated: string | null; status: TranslationStatus; sourceLang: string | null; request: () => void }`

- [ ] **Step 1: Implement `src/translate.ts`**

```ts
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { resolveSourceLang, shouldTranslate, translationKey } from "./lib/lang";
import { readTranslateMode, useTranslateMode } from "./settings";

// Client side of the translation feature.
//
// Engine order, per unique string:
//   1. in-memory Map        — synchronous, survives navigation within the session
//   2. localStorage         — synchronous, survives reloads
//   3. Chrome's Translator  — on-device, free, unlimited; results go to (1)+(2) only
//   4. POST /api/translate  — every other browser; server caches in Supabase
//
// Chrome results are deliberately never sent to the shared server cache: anon
// clients cannot write to it, and mixing two engines' output would show two users
// different English for the same name.

export type TranslationStatus = "none" | "pending" | "ready" | "failed";

type Entry = { status: TranslationStatus; text: string | null };

const NONE: Entry = { status: "none", text: null };
const PENDING: Entry = { status: "pending", text: null };
const FAILED: Entry = { status: "failed", text: null };

const cache = new Map<string, Entry>();
// Per-key subscriptions: resolving one row must not re-render the other 49.
const listeners = new Map<string, Set<() => void>>();

function emit(key: string) {
  const set = listeners.get(key);
  if (set) for (const listener of set) listener();
}

function put(key: string, entry: Entry) {
  cache.set(key, entry);
  emit(key);
}

// --- localStorage ------------------------------------------------------------

const STORE_KEY = "vex-translations";
// Names are short, so this stays well under a megabyte. On overflow the oldest
// quarter goes, by insertion order.
const MAX_STORED = 2000;

let stored: Record<string, string> | null = null;

function loadStored(): Record<string, string> {
  if (stored) return stored;
  try {
    const raw = localStorage.getItem(STORE_KEY);
    stored = raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    stored = {};
  }
  // Seed the memory cache so the first render of a known string is synchronous.
  for (const [key, text] of Object.entries(stored)) {
    if (!cache.has(key)) cache.set(key, { status: "ready", text });
  }
  return stored;
}

function persist(key: string, text: string) {
  const map = loadStored();
  map[key] = text;
  const keys = Object.keys(map);
  if (keys.length > MAX_STORED) {
    for (const old of keys.slice(0, Math.floor(MAX_STORED / 4))) delete map[old];
  }
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(map));
  } catch {
    // Quota or private-mode failure. The memory cache still works for this
    // session; a lost disk cache is not worth surfacing to the user.
  }
}

function resolved(key: string, text: string) {
  put(key, { status: "ready", text });
  persist(key, text);
}

// Seed the memory cache once at module load rather than lazily from the hook's
// getSnapshot, which must stay free of side effects. This is a browser-only SPA,
// so localStorage is always available here.
loadStored();

// --- Chrome's on-device Translator -------------------------------------------

// Minimal shape of the Chrome 138+ global. Typed locally rather than in a .d.ts
// so the declaration sits next to the only code that touches it.
type ChromeTranslator = {
  availability(options: { sourceLanguage: string; targetLanguage: string }): Promise<
    "unavailable" | "downloadable" | "downloading" | "available"
  >;
  create(options: { sourceLanguage: string; targetLanguage: string }): Promise<{
    translate(input: string): Promise<string>;
  }>;
};

function chromeTranslator(): ChromeTranslator | null {
  const global = globalThis as unknown as { Translator?: ChromeTranslator };
  return global.Translator && typeof global.Translator.availability === "function" ? global.Translator : null;
}

// One live translator per language pair, and one warm-up attempt per pair.
const instances = new Map<string, Promise<{ translate(input: string): Promise<string> }>>();
const warmed = new Set<string>();

/**
 * On-device translation, or null to fall through to the server.
 *
 * Only takes the local path when the language pack is already `available`. When
 * it is merely `downloadable`, a first-visit model download would stall every row
 * in the table, so we fire one best-effort warm-up for next time and serve this
 * render from the server. Chrome may refuse the warm-up without a user gesture;
 * that rejection is expected and ignored.
 */
async function translateOnDevice(text: string, sourceLang: string): Promise<string | null> {
  const api = chromeTranslator();
  if (!api) return null;
  const pair = `${sourceLang}|en`;
  const options = { sourceLanguage: sourceLang, targetLanguage: "en" };

  let availability: string;
  try {
    availability = await api.availability(options);
  } catch {
    return null;
  }

  if (availability !== "available") {
    if (availability === "downloadable" && !warmed.has(pair)) {
      warmed.add(pair);
      void api.create(options).catch(() => {});
    }
    return null;
  }

  try {
    let instance = instances.get(pair);
    if (!instance) {
      instance = api.create(options);
      instances.set(pair, instance);
    }
    const translated = (await (await instance).translate(text)).trim();
    // An unchanged string means the model had nothing to offer — treat it as a
    // miss so the server still gets a shot at it.
    return translated && translated !== text ? translated : null;
  } catch {
    instances.delete(pair);
    return null;
  }
}

// --- server batching ----------------------------------------------------------

// An events table renders ~50 names at once. Misses accumulate briefly and go out
// as one POST rather than fifty.
const BATCH_MS = 50;
const MAX_BATCH = 60;

let queued = new Map<string, { text: string; sourceLang: string }>();
let timer: ReturnType<typeof setTimeout> | null = null;

function enqueue(key: string, text: string, sourceLang: string) {
  queued.set(key, { text, sourceLang });
  if (timer) return;
  timer = setTimeout(flush, BATCH_MS);
}

async function flush() {
  timer = null;
  const batch = queued;
  queued = new Map();
  if (!batch.size) return;

  const items = [...batch.values()].slice(0, MAX_BATCH);
  // Anything over the cap goes back in the queue for the next window rather than
  // being dropped.
  const overflow = [...batch.entries()].slice(MAX_BATCH);
  for (const [key, value] of overflow) enqueue(key, value.text, value.sourceLang);

  try {
    const response = await fetch("/api/translate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ items }),
    });
    if (!response.ok) throw new Error(`translate: HTTP ${response.status}`);
    const payload = (await response.json()) as { translations?: Record<string, string> };
    const translations = payload.translations ?? {};

    for (const key of batch.keys()) {
      if (overflow.some(([overflowKey]) => overflowKey === key)) continue;
      const text = translations[key];
      // Absent means the server could not resolve it. Do NOT negatively cache:
      // today's quota exhaustion must not suppress this string permanently.
      if (text) resolved(key, text);
      else put(key, FAILED);
    }
  } catch {
    for (const key of batch.keys()) {
      if (overflow.some(([overflowKey]) => overflowKey === key)) continue;
      put(key, FAILED);
    }
  }
}

// --- resolution ----------------------------------------------------------------

const inflight = new Set<string>();

function start(key: string, text: string, sourceLang: string) {
  if (inflight.has(key)) return;
  inflight.add(key);
  put(key, PENDING);

  void translateOnDevice(text, sourceLang)
    .then((local) => {
      if (local) {
        resolved(key, local);
        inflight.delete(key);
        return;
      }
      enqueue(key, text, sourceLang);
      // The batch flush owns the terminal state from here; clear the in-flight
      // marker on the next tick so a re-render does not double-enqueue.
      setTimeout(() => inflight.delete(key), BATCH_MS * 2);
    })
    .catch(() => {
      put(key, FAILED);
      inflight.delete(key);
    });
}

// --- hook -------------------------------------------------------------------

function subscribeTo(key: string) {
  return (listener: () => void) => {
    let set = listeners.get(key);
    if (!set) {
      set = new Set();
      listeners.set(key, set);
    }
    set.add(listener);
    return () => {
      set.delete(listener);
      if (!set.size) listeners.delete(key);
    };
  };
}

/**
 * English for one upstream string.
 *
 * `country` is the record's own country — `Event.location.country` for event names
 * and venues, `Team.location.country` for team and organization names. A Division
 * carries no location, so pass the parent event's.
 *
 * Returns `status: "none"` for anything that should not be translated at all, which
 * is the signal to render plain text with no icon.
 */
export function useTranslated(text: string | null | undefined, country?: string | null) {
  const mode = useTranslateMode();
  const trimmed = (text ?? "").trim();
  const translatable = shouldTranslate(trimmed, country);
  const sourceLang = translatable ? resolveSourceLang(trimmed, country) : null;
  const key = translatable && sourceLang ? translationKey(trimmed, sourceLang) : "";

  const entry = useSyncExternalStore(
    useCallback((listener: () => void) => (key ? subscribeTo(key)(listener) : () => {}), [key]),
    // getSnapshot must be referentially stable between changes and free of side
    // effects, so return the cached Entry object itself — it is replaced, never
    // mutated. (The localStorage seed happens once at module load, above.)
    useCallback(() => (key ? (cache.get(key) ?? NONE) : NONE), [key]),
    useCallback(() => NONE, []),
  );

  // Auto mode resolves on mount. Manual mode makes zero network requests until
  // `request()` is called — that is the whole point of the mode.
  //
  // This MUST be an effect, not a render-time call: start() emits to subscribers,
  // and updating other components mid-render is exactly what React warns about.
  // StrictMode's double-mount is harmless — start() is guarded by `inflight`.
  useEffect(() => {
    if (!key || !sourceLang) return;
    if ((cache.get(key) ?? NONE).status !== "none") return;
    if (readTranslateMode() !== "auto") return;
    start(key, trimmed, sourceLang);
  }, [key, sourceLang, trimmed, mode]);

  const request = useCallback(() => {
    if (!key || !sourceLang) return;
    const current = cache.get(key);
    if (current && current.status !== "none") return;
    start(key, trimmed, sourceLang);
  }, [key, sourceLang, trimmed]);

  return {
    translated: entry.text,
    // In manual mode an untouched string reports "none" so the component knows to
    // render the original with an actionable icon rather than plain text.
    status: translatable && mode === "manual" && entry.status === "none" ? ("none" as const) : entry.status,
    sourceLang,
    translatable,
    request,
  };
}
```

- [ ] **Step 2: Verify types and lint**

Run: `npx tsc -b && npm run lint`
Expected: no errors.

Note the returned object includes `translatable` in addition to the four fields in
the spec's signature — `TranslatedText` needs to distinguish "nothing to translate"
from "translatable but not yet requested," and both report `status: "none"`.

- [ ] **Step 3: Commit**

```bash
git add src/translate.ts
git commit -m "feat(translate): client cache, on-device engine, and batched server fallback"
```

---

### Task 7: The `<TranslatedText>` component

**Files:**
- Create: `src/components/TranslatedText.tsx`
- Modify: `src/main.tsx` (add the required `TooltipProvider`)
- Modify: `src/styles.css` (append the icon styles)

**Interfaces:**
- Consumes: `useTranslated` from `../translate` (Task 6); `Tooltip`, `TooltipTrigger`, `TooltipContent`, `TooltipProvider` from `./ui/tooltip` (existing but **currently unused** — this is its first consumer).
- Produces: `<TranslatedText text={…} country={…} className?={…} />`

The icon state carries the whole model: **`text-primary` means you are reading
English, `text-muted-foreground` means you are reading the original.**

- [ ] **Step 1: Mount the tooltip provider**

`src/components/ui/tooltip.tsx` exists but nothing imports it yet, so there is no
`TooltipProvider` in the tree. Radix's `Tooltip.Root` throws without one. Add it
once at the root rather than per instance — fifty rows would otherwise mount fifty
providers.

In `src/main.tsx`, add the import:

```tsx
import { TooltipProvider } from "./components/ui/tooltip";
```

and wrap `<App />`:

```tsx
    <AuthProvider>
      <TooltipProvider>
        <App />
      </TooltipProvider>
    </AuthProvider>
```

- [ ] **Step 2: Create the component**

Create `src/components/TranslatedText.tsx`:

```tsx
import { useState } from "react";
import { Languages } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTranslated } from "@/translate";

// Renders one upstream string, in English when we have it.
//
// The icon's color is the entire affordance: accent-colored means you are reading
// English, grey means you are reading the original. A string with nothing to
// translate renders as bare text with no icon at all, and so does a string whose
// translation failed — a dead control that does nothing when clicked is worse
// than no control.
//
// The per-string toggle is deliberately ephemeral component state: it resets on
// navigation. Persisting dozens of individual toggles is not worth the storage,
// and the global Translate Mode setting already covers "I always want originals."

export function TranslatedText({
  text,
  country,
  className,
}: {
  text: string | null | undefined;
  country?: string | null;
  className?: string;
}) {
  const { translated, status, translatable, request } = useTranslated(text, country);
  const [showOriginal, setShowOriginal] = useState(false);

  const original = text ?? "";
  if (!translatable || status === "failed") return <span className={className}>{original}</span>;

  const hasEnglish = status === "ready" && translated !== null;
  const showingEnglish = hasEnglish && !showOriginal;
  const pending = status === "pending";

  const label = showingEnglish ? "Show original" : "Show translation";

  const onClick = () => {
    // Manual mode: the first click is what fetches. `request()` is a no-op once
    // a translation exists, so the same handler covers both modes.
    if (!hasEnglish) {
      request();
      setShowOriginal(false);
      return;
    }
    setShowOriginal((value) => !value);
  };

  return (
    <span className={className}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={`translate-toggle ${showingEnglish ? "is-english" : ""} ${pending ? "is-pending" : ""}`}
            onClick={onClick}
            aria-label={pending ? "Translating…" : label}
            aria-pressed={showingEnglish}
          >
            <Languages size={13} aria-hidden />
          </button>
        </TooltipTrigger>
        <TooltipContent>{pending ? "Translating…" : label}</TooltipContent>
      </Tooltip>
      {showingEnglish ? translated : original}
    </span>
  );
}
```

- [ ] **Step 3: Add the styles**

Append to `src/styles.css`:

```css
/* Translate toggle — the icon beside a translatable name. Accent-colored means
   the English text is showing; muted means the original is. Both colors come
   from the existing token set, so light and dark mode need no extra rules. */
.translate-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  vertical-align: -1px;
  margin-right: 0.28em;
  padding: 0;
  border: 0;
  background: none;
  color: var(--muted-foreground);
  cursor: pointer;
  transition: color 0.15s ease, opacity 0.15s ease;
}

.translate-toggle.is-english {
  color: var(--primary);
}

.translate-toggle:hover {
  opacity: 0.7;
}

.translate-toggle:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 2px;
  border-radius: 3px;
}

/* Pending is a slow pulse rather than a spinner: a spinner in a table cell reads
   as an error state, and the row must not change height. */
.translate-toggle.is-pending {
  animation: translate-pulse 1.1s ease-in-out infinite;
}

@keyframes translate-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}

@media (prefers-reduced-motion: reduce) {
  .translate-toggle.is-pending { animation: none; opacity: 0.6; }
}
```

- [ ] **Step 4: Verify against a real non-English name**

Run: `npx tsc -b && npm run lint`
Expected: no errors.

Then `npm run dev` and temporarily render the component on the home page to check
it in isolation — add this line inside the top-level page component, run the
checks below, then remove it:

```tsx
<TranslatedText text="北京机器人大赛" country="China" />
```

Confirm, in Auto mode:

1. The text renders in English with an accent-colored icon.
2. Hovering the icon shows the tooltip "Show original".
3. Clicking shows `北京机器人大赛` and turns the icon grey; the tooltip becomes
   "Show translation". Clicking again returns to English.
4. Tab to the icon and press Enter — same toggle, with a visible focus ring.
5. Reload: the English appears immediately with no flash (localStorage hit), and
   the Network tab shows **no** `/api/translate` request.

Then switch Settings → Appearance → Translate mode to **Manual**, clear the cache
with `localStorage.removeItem("vex-translations")` in the console, and reload:

6. The original Chinese renders with a grey icon and **no** network request.
7. Clicking the icon pulses it, then swaps to English with an accent-colored icon.

Finally, confirm the negative case renders no icon at all:

```tsx
<TranslatedText text="Spring Qualifier" country="United States" />
```

Remove both temporary lines before committing.

- [ ] **Step 5: Commit**

```bash
git add src/components/TranslatedText.tsx src/main.tsx src/styles.css
git commit -m "feat(translate): TranslatedText component with the icon toggle"
```

---

### Task 8: Wire the render sites

**Files:**
- Modify: `src/App.tsx` (the in-scope name render sites)

**Interfaces:**
- Consumes: `TranslatedText` from `./components/TranslatedText` (Task 7).
- Produces: nothing new.

- [ ] **Step 1: Find every in-scope site**

```bash
grep -n "event\.name\|\.team_name\|\.organization\|location?\.venue\|division\.name" src/App.tsx
```

Roughly 58 matches. **Only the ones that render text into the DOM are in scope.**
Skip every match that is:

- a sort comparator, filter predicate, or search-index build
- an `aria-label`, `title`, `alt`, or `document.title` string
- a CSV/JSON export field (`src/export.ts` call sites) — exports must carry the
  official name
- a value passed to `breadcrumbs.ts`, `recently-viewed.ts`, or `analytics.ts`

The rule of thumb: if a human reads it on screen as a name, translate it; if code
compares, sorts, or exports it, leave it alone.

- [ ] **Step 2: Add the import**

At the top of `src/App.tsx`, with the other local component imports:

```tsx
import { TranslatedText } from "./components/TranslatedText";
```

- [ ] **Step 3: Convert the sites**

Each conversion is the same shape. A bare render:

```tsx
{event.name}
```

becomes:

```tsx
<TranslatedText text={event.name} country={event.location?.country} />
```

A wrapped render keeps its wrapper and passes the class through:

```tsx
<span className="event-card-title">{event.name}</span>
```

becomes:

```tsx
<TranslatedText className="event-card-title" text={event.name} country={event.location?.country} />
```

The `country` argument by field:

| Field | `country` prop |
|---|---|
| `event.name` | `event.location?.country` |
| `event.location?.venue` | `event.location?.country` |
| `team.team_name` | `team.location?.country` |
| `team.organization` | `team.location?.country` |
| `division.name` | the **parent event's** `event.location?.country` — a Division has no location |

Work through these views in order, committing after each so a regression is easy
to bisect:

1. **Events list / cards** — event name and location cells.
2. **Event detail header** — event name and venue.
3. **Event teams tab, rankings, skills, awards tables** — team name, organization.
4. **Team detail header and Team quick view** — team name, organization.
5. **Team events tab and Team matches** — event name.
6. **Division tabs** (line ~7319) — division name.
7. **Search / command palette results** (`cmdk`) — event and team names. Note:
   `cmdk` filters on the *rendered* children by default. Pass the original name to
   the item's `value` prop so typing the original still matches, and let
   `TranslatedText` handle only the visible label.

- [ ] **Step 4: Verify**

Run: `npx tsc -b && npm run lint && npx vitest run`
Expected: no errors, all tests pass.

Then `npm run dev` and check, in Auto mode:

1. Navigate to Events, filter to **China** or **Taiwan**. Event names render in
   English with accent-colored icons; the Network tab shows **one** batched
   `/api/translate` POST for the page, not one per row.
2. Reload the same list — **zero** `/api/translate` requests (localStorage hit),
   and no visible flash of Chinese before the English appears.
3. Open one of those events. The header name and venue are translated; the teams
   table shows translated team and organization names.
4. Filter Events to the **United States**. No icons appear anywhere, and no
   `/api/translate` request fires.
5. Sorting an events table by name still sorts by the original name (the
   comparators were left untouched), and the CSV export still contains the
   original names.
6. In the command palette, typing the original Chinese name still finds the event.

- [ ] **Step 5: Verify the non-Chrome path**

Open the same China-filtered events list in Safari or Firefox. The names still
render in English, and the Network tab shows the batched `/api/translate` POST
doing the work. In Chrome, that POST should be absent or much smaller once the
on-device language pack is available (Chrome may need a reload after the
background warm-up completes on first visit).

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "feat(translate): render event, team, org, venue and division names through TranslatedText"
```

---

## Deferred

With ~58 in-scope matches, an events table where every row is a Chinese event shows
roughly fifty icons in one column. The plan ships them always-visible, because the
icon is the affordance and hiding it makes the feature undiscoverable. If it reads
as too busy on screen, the fallback is revealing the icon on row hover — a
CSS-only change to `.translate-toggle`, no architectural impact.
