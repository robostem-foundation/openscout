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

// The on-device API can hang rather than reject — `availability()` in particular
// never settles on some builds where the AI stack is present but not ready. Without
// a ceiling the string would sit in "pending" forever and never reach the server
// fallback, so every local call races this timeout and a timeout means "fall
// through", not "failed".
const ON_DEVICE_TIMEOUT_MS = 3000;

function withTimeout<T>(promise: Promise<T>): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise,
    new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), ON_DEVICE_TIMEOUT_MS);
    }),
    // Clear on settle so a fast on-device answer does not leave a timer pending
    // for the rest of the window — three per string adds up across a table.
  ]).finally(() => clearTimeout(timer));
}

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

  let availability: string | null;
  try {
    availability = await withTimeout(api.availability(options));
  } catch {
    return null;
  }
  if (availability === null) return null; // hung — let the server handle it

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
    const ready = await withTimeout(instance);
    if (!ready) return null;
    const output = await withTimeout(ready.translate(text));
    if (output === null) return null;
    const translated = output.trim();
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

// The server translates at most MAX_TRANSLATIONS_PER_REQUEST (12) cache MISSES per
// call, so a cold 50-row page gets 12 back and 38 absent. Absent must therefore
// mean "not yet", not "failed" — otherwise most of the page loses its icon and
// only recovers on a reload. Unresolved keys go back on the queue and drain over
// the next few windows, which converges within one page view.
//
// The batch stays at 60 rather than dropping to 12 so that a page whose strings
// are already in the shared cache still resolves in a single round trip.
const attempts = new Map<string, number>();
const MAX_ATTEMPTS = 6; // 6 × 12 comfortably covers a full page; then give up.

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

  const entries = [...batch.entries()];
  const sending = entries.slice(0, MAX_BATCH);
  // Anything over the cap goes back in the queue for the next window rather than
  // being dropped.
  for (const [key, value] of entries.slice(MAX_BATCH)) enqueue(key, value.text, value.sourceLang);

  const items = sending.map(([, value]) => value);

  try {
    const response = await fetch("/api/translate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ items }),
    });
    if (!response.ok) throw new Error(`translate: HTTP ${response.status}`);
    const payload = (await response.json()) as { translations?: Record<string, string> };
    const translations = payload.translations ?? {};

    for (const [key, value] of sending) {
      const text = translations[key];
      if (text) {
        attempts.delete(key);
        resolved(key, text);
        continue;
      }
      // Absent: usually the server's per-request miss cap, occasionally a genuine
      // upstream failure. Retry a bounded number of times, then show the original.
      // Nothing is negatively cached either way, so a later visit tries again.
      const tried = (attempts.get(key) ?? 0) + 1;
      if (tried >= MAX_ATTEMPTS) {
        attempts.delete(key);
        put(key, FAILED);
      } else {
        attempts.set(key, tried);
        enqueue(key, value.text, value.sourceLang);
      }
    }
  } catch {
    // A hard transport failure will not fix itself within a page view; retrying
    // would just hammer a down endpoint. Show the originals.
    for (const [key] of sending) {
      attempts.delete(key);
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
