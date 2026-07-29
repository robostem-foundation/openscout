// Persistent cache for the world-skills leaderboards.
//
// A single board is one season + grade and runs to multi-MB, which is why this
// uses IndexedDB rather than localStorage (the previous World Skills page cache
// wrote them to localStorage and silently lost the write on quota).
//
// Freshness follows how much the data can still move:
//   • a past season is finished — 120 days, effectively "never re-fetch"
//   • the current season changes every weekend — 7 days, then stale-while-
//     revalidate: the cached board renders immediately and one background
//     refresh per visit replaces it if the numbers moved.
//
// Whether a season is current is answered by the season names the app has
// already seen (see noteSeasonNames, fed from the seasons and events endpoints).
// An unknown season id counts as current, so the worst case is refreshing a
// finished season a little more often than needed — never serving a four-month-
// old board for the season being played.

import { useSyncExternalStore } from "react";

import type { WorldSkillsEntry } from "./types";

const DB_NAME = "vex-world-skills";
const STORE = "boards";
const DAY_MS = 24 * 60 * 60 * 1000;
const CURRENT_SEASON_TTL_MS = 7 * DAY_MS;
const PAST_SEASON_TTL_MS = 120 * DAY_MS;

type CacheEntry = { data: WorldSkillsEntry[]; updatedAt: number };

// --- season currency ---------------------------------------------------------

// season id → whether it is the season currently being played.
const seasonIsCurrent = new Map<number, boolean>();

/** The season label the current competition year carries, e.g. "26-27". */
function currentSeasonYearLabel(now = new Date()): string {
  // RobotEvents seasons turn over in spring, not January: a 2026-2027 event can
  // be held in May 2026.
  const year = now.getFullYear() - (now.getMonth() < 4 ? 1 : 0);
  return `${String(year).slice(2)}-${String(year + 1).slice(2)}`;
}

/** Compact two-year label from a season name: "2025-2026: Push Back" → "25-26". */
export function seasonYearLabelFromName(name?: string | null): string {
  if (!name) return "";
  const range = name.match(/(\d{4})\s*[-–]\s*(\d{4})/);
  if (range) return `${range[1].slice(2)}-${range[2].slice(2)}`;
  const single = name.match(/(\d{4})/);
  if (single) {
    const year = Number(single[1]);
    return `${String(year).slice(2)}-${String(year + 1).slice(2)}`;
  }
  return "";
}

/**
 * Record which seasons are current from any payload that carries season names —
 * the seasons endpoints, and the season stamped on every event. Cheap and
 * idempotent; safe to call on every response.
 */
export function noteSeasonNames(seasons: Array<{ id?: number | null; name?: string | null } | null | undefined>) {
  const current = currentSeasonYearLabel();
  for (const season of seasons) {
    if (season?.id == null || !season.name) continue;
    const label = seasonYearLabelFromName(season.name);
    if (label) seasonIsCurrent.set(Number(season.id), label === current);
  }
}

/** Unknown seasons are treated as current — the conservative direction. */
function ttlFor(seasonId: number): number {
  return seasonIsCurrent.get(seasonId) === false ? PAST_SEASON_TTL_MS : CURRENT_SEASON_TTL_MS;
}

// --- IndexedDB ---------------------------------------------------------------

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

async function idbGet(key: string): Promise<CacheEntry | undefined> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
      request.onsuccess = () => resolve(request.result as CacheEntry | undefined);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return undefined; // private mode / storage disabled — behave as a cache miss
  }
}

async function idbPut(key: string, entry: CacheEntry): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(entry, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Out of quota or unavailable: the board still renders, just uncached.
  }
}

// --- change notification -----------------------------------------------------

let version = 0;
const listeners = new Set<() => void>();
const getVersion = () => version;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function bump() {
  version += 1;
  for (const listener of listeners) listener();
}

/**
 * Version counter for dependency arrays. A consumer that lists this picks up the
 * refreshed board when a background revalidation lands; one that doesn't keeps
 * the cached board until the next visit.
 */
export function useWorldSkillsVersion(): number {
  return useSyncExternalStore(subscribe, getVersion, getVersion);
}

// --- the cache ---------------------------------------------------------------

// Resolved boards for this visit, so repeat callers share one payload and at
// most one revalidation happens per key per visit.
const memory = new Map<string, Promise<WorldSkillsEntry[]>>();
const revalidating = new Set<string>();
const updatedAtByKey = new Map<string, number>();

/** When the cached board was fetched, and whether a refresh is in flight. */
export function worldSkillsMeta(key: string): { updatedAt: number | null; revalidating: boolean } {
  return { updatedAt: updatedAtByKey.get(key) ?? null, revalidating: revalidating.has(key) };
}

function revalidate(key: string, fetcher: () => Promise<WorldSkillsEntry[]>) {
  if (revalidating.has(key)) return;
  revalidating.add(key);
  void fetcher()
    .then(async (fresh) => {
      const updatedAt = Date.now();
      await idbPut(key, { data: fresh, updatedAt });
      updatedAtByKey.set(key, updatedAt);
      // Replace the visit's resolved board too, so a consumer that re-runs on the
      // version bump gets the new numbers rather than the ones it already had.
      memory.set(key, Promise.resolve(fresh));
      bump();
    })
    .catch(() => {
      // Refresh failed: the cached board stays, and the next visit tries again.
    })
    .finally(() => {
      revalidating.delete(key);
    });
}

/**
 * Cached read for one season+grade board. Resolves from IndexedDB when the entry
 * is inside its TTL, resolves from a stale entry while refreshing in the
 * background, and otherwise fetches.
 */
export function loadCachedWorldSkills(
  key: string,
  seasonId: number,
  fetcher: () => Promise<WorldSkillsEntry[]>,
): Promise<WorldSkillsEntry[]> {
  const existing = memory.get(key);
  if (existing) return existing;

  const promise = (async () => {
    const cached = await idbGet(key);
    if (cached?.data) {
      updatedAtByKey.set(key, cached.updatedAt);
      const age = Date.now() - cached.updatedAt;
      if (age <= ttlFor(seasonId)) return cached.data;
      // Stale: serve it now, refresh behind it.
      revalidate(key, fetcher);
      return cached.data;
    }

    const fresh = await fetcher();
    const updatedAt = Date.now();
    updatedAtByKey.set(key, updatedAt);
    void idbPut(key, { data: fresh, updatedAt });
    return fresh;
  })();

  memory.set(key, promise);
  // A failed first load must not be cached — drop it so a retry can refetch.
  promise.catch(() => {
    if (memory.get(key) === promise) memory.delete(key);
  });
  return promise;
}
