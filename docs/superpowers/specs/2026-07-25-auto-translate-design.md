# Auto-translate non-English names to English

**Status:** approved design, ready for implementation planning
**Date:** 2026-07-25

## Problem

OpenScout renders event, team, organization, venue, and division names exactly as
RobotEvents stores them. At international events that means rows of Chinese,
Japanese, Korean, and Spanish text that an English-reading scout cannot skim. The
app should show English by default while keeping the original one click away.

Hard constraint: **no paid service, and no service that requires a card on file.**

## Scope

**In scope** — short single-line strings:

- `Event.name`
- `Team.team_name`
- `Team.organization`
- `Event.location.venue`
- `Division.name`

**Out of scope** (explicitly declined during design):

- The Event Info tab's long-form scraped body. MyMemory caps at 500 characters
  per request, so it would need chunking, and quality degrades across chunk
  boundaries.
- Award names — templated by RECF, already English even at international events.
- City / region names — a static lookup beats machine translation for place names.
- Match notes and picklist notes — user-authored, not upstream data.

## Engine strategy

Two engines, on-device first:

1. **Chrome's built-in `Translator` API** (Chrome/Edge 138+). On-device, free,
   unlimited, no infrastructure. Results cache in `localStorage` only.
2. **`POST /api/translate`** → Supabase `translations` cache → MyMemory's free
   public API on a miss. Works in every browser. Results cache in Postgres,
   shared across all users.

The shared server cache is what makes a 5,000-word/day free tier viable: the
corpus of VEX event and team names is finite and mostly static, so each unique
string costs exactly one upstream request *ever*. Steady state is a Postgres read.

### Why on-device results are not written to the shared cache

Anonymous clients cannot write to Supabase — RLS blocks it, and the
`translations` table deliberately has no insert policy (same reasoning as
`event_grades` in migration 0009). Only the server writes, using the service-role
key. Beyond the security argument, mixing Chrome's output and MyMemory's output in
one shared table would mean two users see different English for the same name.

## Language resolution

**Correction to the design discussion:** MyMemory does *not* auto-detect the source
language. Its `langpair` parameter requires an explicit source (`zh-CN|en`). So
source-language resolution is not a Chrome-only concern — the server needs it too.

This makes it shared logic, in one pure module used by both sides:

**`src/lib/lang.ts`** — zero imports, no React, no Node APIs. The client imports it
for the detection gate; the server imports it (`../src/lib/lang.js`) to build the
`langpair`. Keeping it dependency-free is what makes it safe for the server to
import from `src/` without dragging the front-end bundle along.

### `resolveSourceLang(text, country): string | null`

Script first, because it is unambiguous where it applies:

| Signal in the text | Language |
|---|---|
| Hiragana or Katakana present | `ja` |
| Hangul present | `ko` |
| Han only (no kana/hangul) | `zh-TW` if country is TW/HK/MO, else `zh-CN` |
| Cyrillic | country-specific (`uk`, `bg`, `sr`), else `ru` |
| Arabic / Thai / Greek / Hebrew / Devanagari | `ar` / `th` / `el` / `he` / `hi` |

If the text is Latin-script, script tells us nothing, so fall back to
`location.country` via a country→language map (`MX`→`es`, `BR`→`pt`, `FR`→`fr`,
`DE`→`de`, `TR`→`tr`, and so on). English-speaking countries map to `null`.

**Returning `null` means "do not translate."** This is the conservative default and
it covers every uncertain case: unknown country, Latin script with no country
field, mixed content. A missed translation is a much cheaper failure than a
mangled proper noun or a wasted request on an English string.

### `shouldTranslate(text, country): boolean`

`resolveSourceLang(...) !== null`, plus two cheap rejections applied first:

- Text shorter than 2 characters, or containing no letters at all.
- Text that is a team number, SKU, or other identifier (`/^[A-Z0-9-]+$/`).

**Dropped from the design discussion:** Chrome's `LanguageDetector` API. It only
works in Chrome, the server can never use it, and having it disagree with
`resolveSourceLang` would produce two users seeing different results for the same
string. One deterministic resolver, used everywhere, is simpler and portable.

## Client architecture

### `src/translate.ts`

The store and engine orchestration. Public surface:

```ts
useTranslated(text: string | null, country?: string | null): {
  translated: string | null;   // null while pending or if untranslatable
  status: "none" | "pending" | "ready" | "failed";
  sourceLang: string | null;
  /**
   * Force resolution regardless of Translate Mode. In Auto this is a no-op
   * (the hook already resolved on render); in Manual it is how the icon click
   * triggers the only network request the mode ever makes. Idempotent.
   */
  request: () => void;
}
```

**Which `country` to pass.** The field's own record wins where it has one:
`Event.location.country` for event names and venues, `Team.location.country` for
team and organization names. `Division` carries no location, so division names take
the parent event's country.

Resolution order for a single string:

```
shouldTranslate?  no → { status: "none" }
      ↓ yes
in-memory Map     hit → synchronous return, no re-render
      ↓ miss
localStorage      hit → hydrate memory, synchronous return
      ↓ miss
Translate Mode == "manual" and not explicitly requested?
                      → { status: "none" }, no network
      ↓
Chrome Translator availability({source, target:"en"}) === "available"
      ↓ yes                              ↓ no
  translate on-device               enqueue for POST /api/translate
  write localStorage                (50ms batch window)
```

**Chrome model downloads.** `Translator.availability()` can return `downloadable`,
meaning the language pack is not present yet. We do **not** block on that — a
first-visit model download would stall every row. The rule: only take the
on-device path when availability is exactly `available`. When it is
`downloadable`, fire one best-effort `Translator.create()` per language pair per
session to warm the pack for next time, and serve this render from the server.
Chrome may reject the create without a user gesture; that failure is ignored.

**Batching.** An events table renders ~50 names at once. Misses accumulate in a
50ms window and go out as one POST, the same way `api.eventGrades()` batches SKUs
into a comma list. Identical strings within a batch are deduplicated before the
request.

**localStorage budget.** Cached under `vex-translations` as a single JSON object
keyed by `` `${sourceLang}\n${text}` ``. Capped at 2,000 entries; on overflow, drop
the oldest quarter by insertion order. Names are short, so 2,000 entries is well
under a megabyte.

### `src/components/TranslatedText.tsx`

```tsx
<TranslatedText text={event.name} country={event.location?.country} />
```

The icon state carries the whole model: **colored means you are reading English,
grey means you are reading the original.**

| Situation | Renders | Tooltip |
|---|---|---|
| `status: "none"` | plain text, **no icon** | — |
| Showing English | colored icon + English | "Show original" |
| Showing original | grey icon + original | "Show translation" |
| Fetching after a click | grey icon, pulsing + original | "Translating…" |
| `status: "failed"` | plain original, **no icon** | — |

- Icon is `lucide-react`'s `Languages` at `size={13}`, inline before the text with
  a small right margin. "Colored" is the theme's accent (`text-primary`); "grey"
  is `text-muted-foreground`. Both come from the existing token set, so light and
  dark mode are handled without new CSS variables.
- It is a real `<button>`: keyboard focusable, `aria-label` matching the tooltip,
  wrapped in the existing `src/components/ui/tooltip.tsx` primitive.
- A failed translation removes the icon entirely rather than leaving a dead
  control that does nothing when clicked.
- The per-string toggle is ephemeral component state and resets on navigation.
  Persisting dozens of individual toggles is not worth the storage, and the global
  mode already covers "I always want originals."

**No layout jitter.** Cache hits resolve synchronously during render, so the
common path never flashes. A miss renders the original text first and swaps in
place when it resolves — deliberately not a skeleton, which would make every row
in a table jump.

### Settings

`Translate Mode` — a segmented `Auto` / `Manual` control on the **Appearance** tab
of `SettingsPage` (`SETTINGS_TABS` has only `profile` and `appearance`). It reuses
the sliding-indicator segmented toggle from commit `91a1346`.

- **Auto** (default): translatable strings resolve on render.
- **Manual**: **zero network on render.** Strings render as the original with a
  grey icon; a translation is fetched only when the user clicks. This doubles as
  the quota-saver and as the "I read Chinese, stop rewriting my UI" mode.

Wired through the existing `src/settings.ts` store: a new `vex-translate-mode` key
added to `SYNCED_KEYS`, giving it localStorage when signed out and
`user_settings.settings` jsonb when signed in, identical to every other
preference. Exposed as `useTranslateMode()` / `setTranslateMode()` with its own
listener set, following the `useTabLayout` pattern.

## Server architecture

### `server/translate.ts`

Mirrors `server/eventGrades.ts` closely enough that the two read as siblings.

```ts
export type TranslateRequest = { text: string; sourceLang: string };
export async function resolveTranslations(
  requests: TranslateRequest[],
): Promise<Record<string, string>>;   // keyed by `${sourceLang}\n${text}`
```

1. Dedupe requests; compute `hash = sha256(sourceLang + "\n" + text)` (hex).
2. Read `translations` for those hashes (publishable key is enough — public
   select), keyed back to the request key.
3. For misses, up to `MAX_TRANSLATIONS_PER_REQUEST = 12`, concurrency 4, call
   MyMemory. Anything above the cap is omitted and retried on the next call.
4. Write successes back with the service-role key, `on_conflict=hash`,
   `resolution=merge-duplicates`.
5. Omit anything that failed. Callers treat absence as "not translated."

Supabase access reuses the exact helpers from `eventGrades.ts` —
`supabaseConfig("read" | "write")` and `supabaseHeaders()`, including the
`sb_publishable_…` / `sb_secret_…` non-JWT header handling and the one-time
"no SUPABASE_SECRET_KEY" warning. **These should be lifted into a shared
`server/supabaseRest.ts` and imported by both modules** rather than copied. This
is a targeted extraction of code the new work directly depends on, not a general
refactor.

### MyMemory contract

`GET https://api.mymemory.translated.net/get?q=<text>&langpair=<src>|en`

- Anonymous: 5,000 words/day per IP. Adding `de=<email>` raises it to 50,000.
  New optional env var `MYMEMORY_EMAIL`.
- 500-character limit per `q`. Strings over 500 chars are rejected before the
  call — in-scope fields are never that long, and silently truncating a name is
  worse than not translating it.
- Response shape:
  `{ responseData: { translatedText, match }, responseStatus, quotaFinished }`.

Treat a result as **failed** (do not cache, do not display) when any of:

- `responseStatus !== 200`, or `quotaFinished === true`
- `translatedText` is empty, or equal to the input after trimming
- `translatedText` contains `MYMEMORY WARNING` or `QUERY LENGTH LIMIT` — the API
  returns its error prose in the translation field with a 200 status

On `quotaFinished`, abandon the rest of the batch immediately instead of burning
requests that will all fail the same way.

### `api/translate.ts`

Thin Vercel wrapper over `resolveTranslations`, structured exactly like
`api/event-grades.ts`.

- **`POST`**, not GET. Fifty names in a query string would blow past URL length
  limits and would encode badly for non-Latin text. The body is
  `{ items: [{ text, sourceLang }] }`, capped at `MAX_ITEMS = 60`; entries beyond
  the cap are dropped.
- Runs the same abuse guard as the proxy: `guardProxyRequest({ origin, referer, ip })`
  and `clientIpFromForwardedFor` from `server/proxy.ts`, so the origin allowlist
  and the Upstash rate limit apply here too. Without it, `/api/translate` is an
  open relay against the shared MyMemory quota.
- Responds `{ translations: Record<string, string> }`.
- `cache-control: public, s-maxage=86400, stale-while-revalidate=604800` — a name's
  translation is as stable as its grade level. (POST responses are not
  edge-cached; the header is set for correctness and for any intermediary that
  honors it.)

### Wiring

- **`vercel.json`**: add `{ "source": "/api/translate", "destination": "/api/translate" }`
  to `rewrites`, **before** the `/api/:path*` catch-all — same placement as
  `/api/event-grades`.
- **`server/index.ts`**: add `app.post("/api/translate", ...)` before the proxy
  catch-alls. This route needs a JSON body parser; `express.json({ limit: "64kb" })`
  is currently not registered anywhere, so mount it on this route only rather than
  app-wide, to avoid changing how the existing GET routes behave.
- **CSP**: no change needed. `/api/translate` is same-origin (`connect-src 'self'`
  already covers it), and Chrome's `Translator` downloads models through browser
  internals, outside the page's CSP.

### `supabase/migrations/0010_translations.sql`

```sql
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
  for select using (true);

-- No insert/update/delete policy on purpose: writes come from the serverless
-- translator using the service-role key, which bypasses RLS. Anon clients can
-- read the cache but cannot poison it.

commit;
```

Rows do not expire. Following `event_grades`, the migration is run manually in the
Supabase SQL editor and is idempotent and transactional.

## Error handling

Every failure degrades to **showing the original text with no icon**. Translation
is an enhancement; nothing in the app should break or block on it.

| Failure | Behavior |
|---|---|
| No source language resolved | No icon, plain text. Never hits the network. |
| Chrome `Translator` throws or pack unavailable | Falls through to the server path. |
| `/api/translate` 4xx/5xx or network error | `status: "failed"`, original shown, icon removed. |
| MyMemory quota exhausted | Batch abandoned, misses omitted from the response. Client shows originals. |
| Supabase unreachable | Read failure is logged and treated as a full miss; write failure is logged and swallowed (the translation is still returned to the caller). |
| `SUPABASE_SECRET_KEY` unset | Lookups still work, results just are not persisted. One-time `console.warn`, matching `event-grades`. |

Failed strings are **not** negatively cached — a quota exhaustion today should not
suppress the translation permanently. They are simply retried on the next render
that misses.

## Testing

The repo has no test runner today. This work adds one, scoped narrowly: `vitest`
as a devDependency, covering only the pure, high-risk logic where a silent bug
would be invisible in the UI.

- **`src/lib/lang.ts`** — `resolveSourceLang` and `shouldTranslate` across CJK
  disambiguation (kana vs. hangul vs. bare Han), Traditional vs. Simplified by
  country, Cyrillic country overrides, Latin-with-country, Latin-without-country,
  English-speaking countries, team numbers and SKUs, and empty or punctuation-only
  input.
- **MyMemory response parsing** — the failure taxonomy above, especially the
  200-status-with-error-prose cases, which are the easy ones to get wrong.

Everything else is verified manually against the dev server: a known non-English
event (any China or Taiwan regional) in Auto and Manual mode, the per-string
toggle, the settings control persisting across a reload and across sign-in, and
Chrome vs. a non-Chrome browser taking different engine paths.

## Environment

New, both optional, documented in `.env.example`:

```
# Raises MyMemory's free tier from 5,000 to 50,000 words/day. No account, no card
# — the address is just an identifier the API attributes usage to. Server-side.
#   MYMEMORY_EMAIL=
```

No new required configuration. With nothing set, the feature works at the
anonymous MyMemory tier and, on Chrome, mostly bypasses it entirely.

## Files

| File | Change |
|---|---|
| `src/lib/lang.ts` | new — shared, dependency-free language resolution |
| `src/translate.ts` | new — cache, engine chain, `useTranslated()` |
| `src/components/TranslatedText.tsx` | new — icon + text UI |
| `src/settings.ts` | add `vex-translate-mode` to `SYNCED_KEYS`, `useTranslateMode()` / `setTranslateMode()` |
| `src/App.tsx` | swap name render sites to `<TranslatedText>`; add the Appearance-tab control |
| `server/supabaseRest.ts` | new — `supabaseConfig` / `supabaseHeaders` extracted from `eventGrades.ts` |
| `server/eventGrades.ts` | import the extracted helpers instead of defining them |
| `server/translate.ts` | new — cache-first MyMemory resolution |
| `server/index.ts` | new `POST /api/translate` route with a scoped JSON body parser |
| `api/translate.ts` | new — Vercel handler with the proxy abuse guard |
| `vercel.json` | new rewrite before the catch-all |
| `supabase/migrations/0010_translations.sql` | new — shared cache table |
| `.env.example` | document `MYMEMORY_EMAIL` |
| `package.json` | `vitest` devDependency + `test` script |

## Open question deferred to implementation

`App.tsx` has ~58 matches for the in-scope name fields, so an events table where
every row is a Chinese event shows roughly fifty
icons in one column. The design ships them always-visible, because the icon is the
affordance and hiding it makes the feature undiscoverable. If it reads as too busy
once it is on screen, the fallback is revealing the icon on row hover — a CSS-only
change to `TranslatedText`, no architectural impact.
