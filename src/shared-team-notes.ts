import { useSyncExternalStore } from "react";
import { supabase } from "./supabase";

// Shared-team-scoped match notes store.
// Near-identical to notes.ts but keyed by (sharedTeamId, matchId) and cloud-only.
// Lazy-loaded per shared team on first access; debounced writes (600ms).
//
// Notes for a given shared team are fetched when the first component subscribes
// to any note in that shared team. useHasAnySharedTeamNote() is a cross-team
// derived selector used by NoteRailDot to show the filled-dot state.

export type SharedTeamNoteEntry = {
  body: string;
  eventId: string | null;
  updatedAt: string;
};

type SharedTeamNotesMap = { [matchId: string]: SharedTeamNoteEntry };

// Module-level Map: sharedTeamId → notes map for that shared team
const cache = new Map<string, SharedTeamNotesMap>();
// Track which sharedTeamIds have been (or are being) loaded
const loaded = new Set<string>();

// Stable sentinel — same reference every render when cache has no entry.
// Prevents useSyncExternalStore from seeing a phantom change on each render.
const EMPTY_NOTES_MAP: SharedTeamNotesMap = {};

let signedInUserId: string | null = null;

const listeners = new Set<() => void>();

// Epoch increments on every write — useSyncExternalStore uses it as a stable
// primitive snapshot so hooks can re-derive values outside getSnapshot, avoiding
// the "new object every call → infinite loop" pitfall.
let epoch = 0;
function getEpoch() { return epoch; }

function emit() {
  epoch++;
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function getForSharedTeam(sharedTeamId: string): SharedTeamNotesMap {
  return cache.get(sharedTeamId) ?? EMPTY_NOTES_MAP;
}

function setForSharedTeam(sharedTeamId: string, notes: SharedTeamNotesMap) {
  cache.set(sharedTeamId, notes);
  emit();
}

// Wipe cache on sign-out
(function watchAuth() {
  const sb = supabase;
  if (!sb) return;
  sb.auth.onAuthStateChange((_event, session) => {
    const uid = session?.user?.id ?? null;
    signedInUserId = uid;
    if (!uid) {
      cache.clear();
      loaded.clear();
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
      emit();
    }
  });
  void sb.auth.getSession().then(({ data }) => {
    signedInUserId = data.session?.user?.id ?? null;
  });
})();

// ── Cloud load per shared team ──────────────────────────────────────────────────

async function loadForSharedTeam(sharedTeamId: string): Promise<void> {
  const sb = supabase;
  if (!sb || loaded.has(sharedTeamId)) return;
  loaded.add(sharedTeamId);

  const { data } = await sb
    .from("shared_team_match_notes")
    .select("match_id, event_id, body, updated_at")
    .eq("shared_team_id", sharedTeamId);

  const notes: SharedTeamNotesMap = {};
  for (const row of (data ?? []) as Array<{
    match_id: string;
    event_id: string | null;
    body: string;
    updated_at: string;
  }>) {
    if (!row.body || row.body.trim() === "") continue;
    notes[row.match_id] = {
      body: row.body,
      eventId: row.event_id,
      updatedAt: row.updated_at ?? new Date(0).toISOString(),
    };
  }

  setForSharedTeam(sharedTeamId, notes);
}

// ── Debounced cloud writes ────────────────────────────────────────────────────

const FLUSH_MS = 600;
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function timerKey(sharedTeamId: string, matchId: string) {
  return `${sharedTeamId}:${matchId}`;
}

function scheduleCloudWrite(sharedTeamId: string, matchId: string) {
  const key = timerKey(sharedTeamId, matchId);
  const existing = timers.get(key);
  if (existing) clearTimeout(existing);
  timers.set(
    key,
    setTimeout(() => {
      timers.delete(key);
      flushCloud(sharedTeamId, matchId);
    }, FLUSH_MS),
  );
}

function flushCloud(sharedTeamId: string, matchId: string) {
  const sb = supabase;
  if (!sb || !signedInUserId) return;
  const uid = signedInUserId;
  const notes = getForSharedTeam(sharedTeamId);
  const entry = notes[matchId];

  if (!entry || entry.body.trim() === "") {
    void sb
      .from("shared_team_match_notes")
      .delete()
      .eq("shared_team_id", sharedTeamId)
      .eq("match_id", matchId)
      .then(({ error }) => {
        if (error) {
          // Revert on error by re-fetching
          loaded.delete(sharedTeamId);
          void loadForSharedTeam(sharedTeamId);
        }
      });
  } else {
    void sb
      .from("shared_team_match_notes")
      .upsert(
        {
          shared_team_id: sharedTeamId,
          match_id: matchId,
          event_id: entry.eventId,
          body: entry.body,
          updated_at: entry.updatedAt,
          last_edited_by: uid,
        },
        { onConflict: "shared_team_id,match_id" },
      )
      .then(({ error }) => {
        if (error) {
          loaded.delete(sharedTeamId);
          void loadForSharedTeam(sharedTeamId);
        }
      });
  }
}

function flushAll() {
  for (const [key, timer] of timers) {
    clearTimeout(timer);
    const [sharedTeamId, matchId] = key.split(":");
    if (sharedTeamId && matchId) flushCloud(sharedTeamId, matchId);
  }
  timers.clear();
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", flushAll);
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushAll();
  });
}

// ── Public actions ────────────────────────────────────────────────────────────

/**
 * Write (or clear) a shared-team-scoped note. Optimistic; debounced cloud write.
 * Empty/whitespace body deletes the note.
 */
export function setSharedTeamMatchNote(
  sharedTeamId: string,
  matchId: string | number,
  eventId: string | number | null,
  body: string,
): void {
  if (!signedInUserId) return; // cloud-only; no-op when signed out
  const id = String(matchId);
  const notes = { ...getForSharedTeam(sharedTeamId) };

  if (body.trim() === "") {
    delete notes[id];
  } else {
    notes[id] = {
      body,
      eventId: eventId == null ? null : String(eventId),
      updatedAt: new Date().toISOString(),
    };
  }

  setForSharedTeam(sharedTeamId, notes);
  scheduleCloudWrite(sharedTeamId, id);
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

/** Full note body + hasNote flag for a single shared-team note. */
export function useSharedTeamMatchNote(
  sharedTeamId: string,
  matchId: string | number,
): { body: string; hasNote: boolean } {
  // Trigger lazy load (skips if already loading/loaded or sharedTeamId is sentinel)
  if (sharedTeamId && sharedTeamId !== "__none__" && !loaded.has(sharedTeamId)) {
    void loadForSharedTeam(sharedTeamId);
  }
  // Subscribe via epoch (a primitive) so getSnapshot never returns a new object.
  // Derived values are computed here, outside getSnapshot, which is correct.
  useSyncExternalStore(subscribe, getEpoch, getEpoch);
  const entry = getForSharedTeam(sharedTeamId)[String(matchId)];
  return { body: entry?.body ?? "", hasNote: Boolean(entry && entry.body.trim() !== "") };
}

/** Cheap boolean for a single shared-team note. */
export function useHasSharedTeamNote(sharedTeamId: string, matchId: string | number): boolean {
  if (sharedTeamId && sharedTeamId !== "__none__" && !loaded.has(sharedTeamId)) {
    void loadForSharedTeam(sharedTeamId);
  }
  useSyncExternalStore(subscribe, getEpoch, getEpoch);
  return Boolean(getForSharedTeam(sharedTeamId)[String(matchId)]);
}

export type SharedTeamNoteListItem = {
  matchId: string;
  eventId: string | null;
  body: string;
  updatedAt: string;
};

/**
 * All of a shared team's notes as a flat list, newest first. Triggers the same
 * lazy load as the single-note hooks and reads the already-loaded per-team cache
 * — no extra round-trips. Used by the shared team workspace Notes hub.
 */
export function useSharedTeamNotesList(sharedTeamId: string): SharedTeamNoteListItem[] {
  if (sharedTeamId && sharedTeamId !== "__none__" && !loaded.has(sharedTeamId)) {
    void loadForSharedTeam(sharedTeamId);
  }
  useSyncExternalStore(subscribe, getEpoch, getEpoch);
  const list: SharedTeamNoteListItem[] = [];
  for (const [matchId, entry] of Object.entries(getForSharedTeam(sharedTeamId))) {
    if (!entry.body || entry.body.trim() === "") continue;
    list.push({ matchId, eventId: entry.eventId, body: entry.body, updatedAt: entry.updatedAt });
  }
  list.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
  return list;
}

/**
 * Cross-team derived selector — returns true if ANY loaded shared team has a
 * note for this match. Used by NoteRailDot so it doesn't need to call hooks in
 * a loop.
 */
export function useHasAnySharedTeamNote(matchId: string | number): boolean {
  useSyncExternalStore(subscribe, getEpoch, getEpoch);
  const id = String(matchId);
  for (const notes of cache.values()) {
    if (notes[id]) return true;
  }
  return false;
}
