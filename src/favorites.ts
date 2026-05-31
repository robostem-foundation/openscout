import { useSyncExternalStore } from "react";
import { supabase } from "./supabase";

// Favorites store with two interchangeable backends:
//   • signed out  → localStorage (identical to the original behavior)
//   • signed in   → the Supabase `favorites` table (synced across devices)
// It subscribes to auth state and flips backend automatically. Components read
// through the hooks below (useSyncExternalStore), so a toggle anywhere updates
// every FavoriteButton and the FavoritesPanel live.

export type FavoriteKind = "team" | "event";

const LS_KEY = (kind: FavoriteKind) => `vex-alliance:favorites:${kind}`;
// Per-browser flag: set once this browser's local favorites have been pushed to
// the cloud, so we never resurrect something the user later removed elsewhere.
const MERGED_FLAG = "vex-alliance:favorites:synced";

type State = {
  team: string[];
  event: string[];
  ready: boolean; // backend finished its initial load
  signedIn: boolean;
};

let state: State = { team: [], event: [], ready: false, signedIn: false };

const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function setState(patch: Partial<State>) {
  state = { ...state, ...patch };
  emit();
}

// Replace one kind's array immutably while preserving the other's reference, so
// useAsync deps in the panel stay stable when an unrelated kind changes.
function setKind(kind: FavoriteKind, ids: string[]) {
  if (kind === "team") setState({ team: ids });
  else setState({ event: ids });
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

function readLocal(kind: FavoriteKind): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(LS_KEY(kind)) ?? "[]");
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function writeLocal(kind: FavoriteKind, ids: string[]) {
  localStorage.setItem(LS_KEY(kind), JSON.stringify(ids));
}

function loadLocal() {
  setState({ team: readLocal("team"), event: readLocal("event"), ready: true, signedIn: false });
}

// --- Supabase backend (signed in) ------------------------------------------

let userId: string | null = null;

async function fetchCloud(sb: NonNullable<typeof supabase>, uid: string) {
  const { data } = await sb.from("favorites").select("kind, ref_id").eq("user_id", uid);
  const team: string[] = [];
  const event: string[] = [];
  for (const row of (data ?? []) as Array<{ kind: string; ref_id: string }>) {
    if (row.kind === "team") team.push(String(row.ref_id));
    else if (row.kind === "event") event.push(String(row.ref_id));
  }
  return { team, event };
}

async function loadCloud(uid: string) {
  const sb = supabase;
  if (!sb) return;
  userId = uid;

  let cloud = await fetchCloud(sb, uid);

  // One-time, non-destructive merge of this browser's local favorites into the
  // cloud — runs at most once per browser (guarded by MERGED_FLAG).
  if (localStorage.getItem(MERGED_FLAG) !== "true") {
    const rows: Array<{ user_id: string; kind: FavoriteKind; ref_id: string }> = [];
    for (const id of readLocal("team")) if (!cloud.team.includes(id)) rows.push({ user_id: uid, kind: "team", ref_id: id });
    for (const id of readLocal("event")) if (!cloud.event.includes(id)) rows.push({ user_id: uid, kind: "event", ref_id: id });
    if (rows.length) {
      await sb.from("favorites").upsert(rows, { onConflict: "user_id,kind,ref_id", ignoreDuplicates: true });
      cloud = await fetchCloud(sb, uid);
    }
    localStorage.setItem(MERGED_FLAG, "true");
  }

  setState({ team: cloud.team, event: cloud.event, ready: true, signedIn: true });
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

// --- public actions + hooks ------------------------------------------------

export function toggleFavorite(kind: FavoriteKind, rawId: string | number) {
  const id = String(rawId);
  const current = state[kind];
  const active = current.includes(id);
  const next = active ? current.filter((item) => item !== id) : [...current, id];

  setKind(kind, next); // optimistic — UI updates immediately

  const sb = supabase;
  if (state.signedIn && sb && userId) {
    const uid = userId;
    const revertOnError = (error: unknown) => {
      if (error) void fetchCloud(sb, uid).then((cloud) => setState({ team: cloud.team, event: cloud.event }));
    };
    if (active) {
      void sb
        .from("favorites")
        .delete()
        .eq("user_id", uid)
        .eq("kind", kind)
        .eq("ref_id", id)
        .then((res) => revertOnError(res.error));
    } else {
      void sb
        .from("favorites")
        .upsert({ user_id: uid, kind, ref_id: id }, { onConflict: "user_id,kind,ref_id", ignoreDuplicates: true })
        .then((res) => revertOnError(res.error));
    }
  } else {
    writeLocal(kind, next);
  }
}

export function useFavorite(kind: FavoriteKind, rawId: string | number): boolean {
  const snapshot = useSyncExternalStore(subscribe, getState, getState);
  return snapshot[kind].includes(String(rawId));
}

export function useFavoriteIds(kind: FavoriteKind): string[] {
  const snapshot = useSyncExternalStore(subscribe, getState, getState);
  return snapshot[kind];
}

export function useFavoritesReady(): boolean {
  const snapshot = useSyncExternalStore(subscribe, getState, getState);
  return snapshot.ready;
}
