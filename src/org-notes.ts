import { useSyncExternalStore } from "react";
import { supabase } from "./supabase";

// Org-scoped match notes store.
// Near-identical to notes.ts but keyed by (orgId, matchId) and cloud-only.
// Lazy-loaded per org on first access; debounced writes (600ms).
//
// Notes for a given org are fetched when the first component subscribes to
// any note in that org. useHasAnyOrgNote() is a cross-org derived selector
// used by NoteRailDot to show the filled-dot state.

export type OrgNoteEntry = {
  body: string;
  eventId: string | null;
  updatedAt: string;
};

type OrgNotesMap = { [matchId: string]: OrgNoteEntry };

// Module-level Map: orgId → notes map for that org
const cache = new Map<string, OrgNotesMap>();
// Track which orgIds have been (or are being) loaded
const loaded = new Set<string>();

// Stable sentinel — same reference every render when cache has no entry.
// Prevents useSyncExternalStore from seeing a phantom change on each render.
const EMPTY_NOTES_MAP: OrgNotesMap = {};

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

function getForOrg(orgId: string): OrgNotesMap {
  return cache.get(orgId) ?? EMPTY_NOTES_MAP;
}

function setForOrg(orgId: string, notes: OrgNotesMap) {
  cache.set(orgId, notes);
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

// ── Cloud load per org ────────────────────────────────────────────────────────

async function loadForOrg(orgId: string): Promise<void> {
  const sb = supabase;
  if (!sb || loaded.has(orgId)) return;
  loaded.add(orgId);

  const { data } = await sb
    .from("org_match_notes")
    .select("match_id, event_id, body, updated_at")
    .eq("org_id", orgId);

  const notes: OrgNotesMap = {};
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

  setForOrg(orgId, notes);
}

// ── Debounced cloud writes ────────────────────────────────────────────────────

const FLUSH_MS = 600;
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function timerKey(orgId: string, matchId: string) {
  return `${orgId}:${matchId}`;
}

function scheduleCloudWrite(orgId: string, matchId: string) {
  const key = timerKey(orgId, matchId);
  const existing = timers.get(key);
  if (existing) clearTimeout(existing);
  timers.set(
    key,
    setTimeout(() => {
      timers.delete(key);
      flushCloud(orgId, matchId);
    }, FLUSH_MS),
  );
}

function flushCloud(orgId: string, matchId: string) {
  const sb = supabase;
  if (!sb || !signedInUserId) return;
  const uid = signedInUserId;
  const notes = getForOrg(orgId);
  const entry = notes[matchId];

  if (!entry || entry.body.trim() === "") {
    void sb
      .from("org_match_notes")
      .delete()
      .eq("org_id", orgId)
      .eq("match_id", matchId)
      .then(({ error }) => {
        if (error) {
          // Revert on error by re-fetching
          loaded.delete(orgId);
          void loadForOrg(orgId);
        }
      });
  } else {
    void sb
      .from("org_match_notes")
      .upsert(
        {
          org_id: orgId,
          match_id: matchId,
          event_id: entry.eventId,
          body: entry.body,
          updated_at: entry.updatedAt,
          last_edited_by: uid,
        },
        { onConflict: "org_id,match_id" },
      )
      .then(({ error }) => {
        if (error) {
          loaded.delete(orgId);
          void loadForOrg(orgId);
        }
      });
  }
}

function flushAll() {
  for (const [key, timer] of timers) {
    clearTimeout(timer);
    const [orgId, matchId] = key.split(":");
    if (orgId && matchId) flushCloud(orgId, matchId);
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
 * Write (or clear) an org-scoped note. Optimistic; debounced cloud write.
 * Empty/whitespace body deletes the note.
 */
export function setOrgMatchNote(
  orgId: string,
  matchId: string | number,
  eventId: string | number | null,
  body: string,
): void {
  if (!signedInUserId) return; // cloud-only; no-op when signed out
  const id = String(matchId);
  const notes = { ...getForOrg(orgId) };

  if (body.trim() === "") {
    delete notes[id];
  } else {
    notes[id] = {
      body,
      eventId: eventId == null ? null : String(eventId),
      updatedAt: new Date().toISOString(),
    };
  }

  setForOrg(orgId, notes);
  scheduleCloudWrite(orgId, id);
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

/** Full note body + hasNote flag for a single org note. */
export function useOrgMatchNote(
  orgId: string,
  matchId: string | number,
): { body: string; hasNote: boolean } {
  // Trigger lazy load (skips if already loading/loaded or orgId is sentinel)
  if (orgId && orgId !== "__none__" && !loaded.has(orgId)) {
    void loadForOrg(orgId);
  }
  // Subscribe via epoch (a primitive) so getSnapshot never returns a new object.
  // Derived values are computed here, outside getSnapshot, which is correct.
  useSyncExternalStore(subscribe, getEpoch, getEpoch);
  const entry = getForOrg(orgId)[String(matchId)];
  return { body: entry?.body ?? "", hasNote: Boolean(entry && entry.body.trim() !== "") };
}

/** Cheap boolean for a single org note. */
export function useHasOrgNote(orgId: string, matchId: string | number): boolean {
  if (orgId && orgId !== "__none__" && !loaded.has(orgId)) {
    void loadForOrg(orgId);
  }
  useSyncExternalStore(subscribe, getEpoch, getEpoch);
  return Boolean(getForOrg(orgId)[String(matchId)]);
}

/**
 * Cross-org derived selector — returns true if ANY loaded org has a note for
 * this match. Used by NoteRailDot so it doesn't need to call hooks in a loop.
 */
export function useHasAnyOrgNote(matchId: string | number): boolean {
  useSyncExternalStore(subscribe, getEpoch, getEpoch);
  const id = String(matchId);
  for (const notes of cache.values()) {
    if (notes[id]) return true;
  }
  return false;
}
