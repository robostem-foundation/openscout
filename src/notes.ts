import { useSyncExternalStore } from "react";
import { supabase } from "./supabase";

// Per-match notes store with two interchangeable backends, mirroring favorites.ts:
//   • signed out → localStorage (a single JSON object map)
//   • signed in  → the Supabase `match_notes` table (synced across devices)
// Components read through the hooks below (useSyncExternalStore), so editing a
// note in the rail popover or the video panel updates every surface live.
//
// A note is keyed by the RobotEvents match id (stringified). An empty/whitespace
// body means "no note" — it is deleted, never stored.

export type NoteEntry = { body: string; eventId: string | null; updatedAt: string };
type NotesMap = { [matchId: string]: NoteEntry };

const LS_KEY = "vex-alliance:match-notes";
// Per-browser flag: set once this browser's local notes have been pushed to the
// cloud, so we never resurrect a note the user later removed elsewhere.
const MERGED_FLAG = "vex-alliance:match-notes:synced";

type State = {
  notes: NotesMap;
  ready: boolean; // backend finished its initial load
  signedIn: boolean;
};

let state: State = { notes: {}, ready: false, signedIn: false };

const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function setState(patch: Partial<State>) {
  state = { ...state, ...patch };
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getState(): State {
  return state;
}

// --- localStorage backend (signed out) -------------------------------------

function readLocal(): NotesMap {
  try {
    const parsed = JSON.parse(localStorage.getItem(LS_KEY) ?? "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: NotesMap = {};
    for (const [id, raw] of Object.entries(parsed as Record<string, unknown>)) {
      if (!raw || typeof raw !== "object") continue;
      const entry = raw as Partial<NoteEntry>;
      if (typeof entry.body !== "string" || entry.body.trim() === "") continue;
      out[id] = {
        body: entry.body,
        eventId: typeof entry.eventId === "string" ? entry.eventId : null,
        updatedAt: typeof entry.updatedAt === "string" ? entry.updatedAt : new Date(0).toISOString(),
      };
    }
    return out;
  } catch {
    return {};
  }
}

function writeLocal(notes: NotesMap) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(notes));
  } catch {
    // ignore quota / unavailable storage
  }
}

function loadLocal() {
  setState({ notes: readLocal(), ready: true, signedIn: false });
}

// --- Supabase backend (signed in) ------------------------------------------

let userId: string | null = null;

async function fetchCloud(sb: NonNullable<typeof supabase>, uid: string): Promise<NotesMap> {
  const { data } = await sb.from("match_notes").select("match_id, event_id, body, updated_at").eq("user_id", uid);
  const notes: NotesMap = {};
  for (const row of (data ?? []) as Array<{ match_id: string; event_id: string | null; body: string; updated_at: string }>) {
    if (!row.body || row.body.trim() === "") continue;
    notes[String(row.match_id)] = {
      body: row.body,
      eventId: row.event_id == null ? null : String(row.event_id),
      updatedAt: row.updated_at ?? new Date(0).toISOString(),
    };
  }
  return notes;
}

async function loadCloud(uid: string) {
  const sb = supabase;
  if (!sb) return;
  userId = uid;

  let cloud = await fetchCloud(sb, uid);

  // One-time, non-destructive merge of this browser's local notes into the
  // cloud — runs at most once per browser (guarded by MERGED_FLAG). Newest-wins
  // per match by updatedAt (ISO strings compare lexicographically).
  if (localStorage.getItem(MERGED_FLAG) !== "true") {
    const local = readLocal();
    const rows: Array<{ user_id: string; match_id: string; event_id: string | null; body: string; updated_at: string }> = [];
    for (const [id, entry] of Object.entries(local)) {
      const existing = cloud[id];
      if (!existing || entry.updatedAt > existing.updatedAt) {
        rows.push({ user_id: uid, match_id: id, event_id: entry.eventId, body: entry.body, updated_at: entry.updatedAt });
      }
    }
    if (rows.length) {
      await sb.from("match_notes").upsert(rows, { onConflict: "user_id,match_id" });
      cloud = await fetchCloud(sb, uid);
    }
    localStorage.setItem(MERGED_FLAG, "true");
  }

  setState({ notes: cloud, ready: true, signedIn: true });
}

// --- auth wiring: pick the backend and dedupe redundant loads --------------

let loadedFor: string | null | undefined = undefined;

function applyAuth(uid: string | null) {
  if (uid === loadedFor) return;
  loadedFor = uid;
  if (uid) {
    void loadCloud(uid);
  } else {
    userId = null;
    loadLocal();
  }
}

(function init() {
  const sb = supabase;
  if (!sb) {
    // Accounts layer dormant — behave exactly like the original localStorage site.
    loadLocal();
    return;
  }
  void sb.auth.getSession().then(({ data }) => applyAuth(data.session?.user?.id ?? null));
  sb.auth.onAuthStateChange((_event, session) => applyAuth(session?.user?.id ?? null));
})();

// --- debounced cloud writes ------------------------------------------------

const FLUSH_MS = 600;
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleCloudWrite(matchId: string) {
  const existing = timers.get(matchId);
  if (existing) clearTimeout(existing);
  timers.set(
    matchId,
    setTimeout(() => {
      timers.delete(matchId);
      flushCloud(matchId);
    }, FLUSH_MS),
  );
}

function flushCloud(matchId: string) {
  const sb = supabase;
  if (!state.signedIn || !sb || !userId) return;
  const uid = userId;
  const entry = state.notes[matchId];
  const revert = (error: unknown) => {
    if (error) void fetchCloud(sb, uid).then((notes) => setState({ notes }));
  };
  if (!entry || entry.body.trim() === "") {
    void sb.from("match_notes").delete().eq("user_id", uid).eq("match_id", matchId).then((res) => revert(res.error));
  } else {
    void sb
      .from("match_notes")
      .upsert(
        { user_id: uid, match_id: matchId, event_id: entry.eventId, body: entry.body, updated_at: entry.updatedAt },
        { onConflict: "user_id,match_id" },
      )
      .then((res) => revert(res.error));
  }
}

// Best-effort flush of any pending debounced writes when the tab is hidden or
// closing (localStorage already holds the latest, so cloud lag is acceptable).
function flushAll() {
  for (const [matchId, timer] of timers) {
    clearTimeout(timer);
    flushCloud(matchId);
  }
  timers.clear();
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", flushAll);
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushAll();
  });
}

// --- public actions + hooks ------------------------------------------------

// Optimistic write. Empty/whitespace body deletes the note. Local writes are
// immediate; cloud writes are debounced (~600ms) when signed in.
export function setMatchNote(matchId: string | number, eventId: string | number | null, body: string) {
  const id = String(matchId);
  const next: NotesMap = { ...state.notes };
  if (body.trim() === "") {
    delete next[id];
  } else {
    next[id] = {
      body,
      eventId: eventId == null ? null : String(eventId),
      updatedAt: new Date().toISOString(),
    };
  }
  setState({ notes: next }); // optimistic — rail dot + editors update instantly

  if (state.signedIn) scheduleCloudWrite(id);
  else writeLocal(next);
}

// Full note for the editors (textarea binds to .body).
export function useMatchNote(matchId: string | number): { body: string; hasNote: boolean } {
  const snapshot = useSyncExternalStore(subscribe, getState, getState);
  const entry = snapshot.notes[String(matchId)];
  return { body: entry?.body ?? "", hasNote: Boolean(entry && entry.body.trim() !== "") };
}

// Cheap boolean for the rail — one per row. The inline getSnapshot returns a
// primitive so useSyncExternalStore bails out of re-render unless THIS row's
// has-note flag actually flips (so typing in one note doesn't re-render the
// whole table).
export function useHasNote(matchId: string | number): boolean {
  const id = String(matchId);
  const getSnapshot = () => Boolean(state.notes[id]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useNotesReady(): boolean {
  const snapshot = useSyncExternalStore(subscribe, getState, getState);
  return snapshot.ready;
}
