import { useSyncExternalStore } from "react";

// Recently-viewed teams and events — localStorage-backed, no cloud sync.
// Same useSyncExternalStore pattern as favorites.ts / shared-team-favorites.ts.
// Entries are stored with their display data (label, sub, badge) so we can
// render them instantly without a re-fetch.

export type RecentEntry = {
  path: string;   // e.g. "/team/VRC/12345A" or "/event/RE-VRC-25-1234"
  type: "team" | "event";
  label: string;  // team number or event name — captured at visit time
  sub: string;    // team name + location, or season + city
  badge: string;  // program code ("VRC") or season year ("'26")
};

const STORAGE_KEY = "vex-recently-viewed";
const MAX_ENTRIES = 20;

// Stable sentinel — prevents useSyncExternalStore infinite-loop on empty state
// (same pattern as EMPTY_FAV_STATE in shared-team-favorites.ts).
const EMPTY: RecentEntry[] = [];

let entries: RecentEntry[] = (() => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as RecentEntry[];
  } catch {
    return [];
  }
})();

const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function getSnapshot(): RecentEntry[] {
  return entries.length > 0 ? entries : EMPTY;
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // localStorage quota exceeded — best effort
  }
}

/** Prepend an entry, dedup by path, cap at MAX_ENTRIES. */
export function pushRecentlyViewed(entry: RecentEntry): void {
  entries = [entry, ...entries.filter((e) => e.path !== entry.path)].slice(0, MAX_ENTRIES);
  save();
  emit();
}

/** Clear all recently-viewed history. */
export function clearRecentlyViewed(): void {
  entries = [];
  save();
  emit();
}

/** React hook — returns the current recently-viewed list. */
export function useRecentlyViewed(): RecentEntry[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
