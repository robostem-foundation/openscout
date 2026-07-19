import { useSyncExternalStore } from "react";
import { supabase } from "./supabase";

// Per-shared-team shared favorites store.
// Lazy-loaded: fetches from Supabase the first time a component subscribes to
// a given sharedTeamId. Cached in a module-level Map until sign-out.
// Optimistic toggle: update Map entry immediately, fire upsert/delete in
// background, revert on error — same pattern as favorites.ts.

export type SharedTeamFavoriteKind = "team" | "event";

type SharedTeamFavState = {
  teams: string[];
  events: string[];
  ready: boolean;
};

// Module-level Map: sharedTeamId → state for that shared team
const cache = new Map<string, SharedTeamFavState>();
// Track which sharedTeamIds are currently being fetched (avoid duplicate requests)
const loading = new Set<string>();

// Stable sentinel so useSyncExternalStore sees the same reference every render
// when there is no cache entry yet — prevents the "getSnapshot result must be
// cached" infinite-loop warning (React compares snapshots by reference).
const EMPTY_FAV_STATE: SharedTeamFavState = { teams: [], events: [], ready: false };

const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function getForSharedTeam(sharedTeamId: string): SharedTeamFavState {
  return cache.get(sharedTeamId) ?? EMPTY_FAV_STATE;
}

function setForSharedTeam(sharedTeamId: string, patch: Partial<SharedTeamFavState>) {
  const prev = cache.get(sharedTeamId) ?? EMPTY_FAV_STATE;
  cache.set(sharedTeamId, { ...prev, ...patch });
  emit();
}

// Wipe cache on sign-out so re-signing shows fresh data
(function watchAuth() {
  const sb = supabase;
  if (!sb) return;
  sb.auth.onAuthStateChange((_event, session) => {
    if (!session) {
      cache.clear();
      loading.clear();
      emit();
    }
  });
})();

async function loadForSharedTeam(sharedTeamId: string): Promise<void> {
  const sb = supabase;
  if (!sb || loading.has(sharedTeamId)) return;
  loading.add(sharedTeamId);

  const { data } = await sb
    .from("shared_team_favorites")
    .select("kind, ref_id")
    .eq("shared_team_id", sharedTeamId);

  const teams: string[] = [];
  const events: string[] = [];
  for (const row of (data ?? []) as Array<{ kind: string; ref_id: string }>) {
    if (row.kind === "team") teams.push(row.ref_id);
    else if (row.kind === "event") events.push(row.ref_id);
  }

  setForSharedTeam(sharedTeamId, { teams, events, ready: true });
  loading.delete(sharedTeamId);
}

// ── Public actions ────────────────────────────────────────────────────────────

/**
 * Toggle a shared-team favorite. Optimistic: updates immediately, reverts on error.
 */
export async function toggleSharedTeamFavorite(
  sharedTeamId: string,
  kind: SharedTeamFavoriteKind,
  refId: string,
): Promise<void> {
  const sb = supabase;
  if (!sb) return;

  const prev = getForSharedTeam(sharedTeamId);
  const arr = kind === "team" ? prev.teams : prev.events;
  const has = arr.includes(refId);

  // Optimistic update
  if (has) {
    setForSharedTeam(sharedTeamId, { [kind === "team" ? "teams" : "events"]: arr.filter((id) => id !== refId) });
  } else {
    setForSharedTeam(sharedTeamId, { [kind === "team" ? "teams" : "events"]: [...arr, refId] });
  }

  const revert = () => {
    setForSharedTeam(sharedTeamId, { [kind === "team" ? "teams" : "events"]: arr });
  };

  if (has) {
    const { error } = await sb
      .from("shared_team_favorites")
      .delete()
      .eq("shared_team_id", sharedTeamId)
      .eq("kind", kind)
      .eq("ref_id", refId);
    if (error) revert();
  } else {
    const { data: session } = await sb.auth.getSession();
    const uid = session.session?.user?.id ?? null;
    const { error } = await sb
      .from("shared_team_favorites")
      .upsert({ shared_team_id: sharedTeamId, kind, ref_id: refId, added_by: uid }, { onConflict: "shared_team_id,kind,ref_id" });
    if (error) revert();
  }
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

/**
 * Returns the shared favorites for a shared team. Triggers a lazy fetch on first
 * call for each sharedTeamId.
 */
export function useSharedTeamFavorites(sharedTeamId: string): SharedTeamFavState {
  // Trigger load if not yet started
  const current = cache.get(sharedTeamId);
  if (!current && !loading.has(sharedTeamId)) {
    void loadForSharedTeam(sharedTeamId);
  }

  const getSnapshot = () => getForSharedTeam(sharedTeamId);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Boolean: is this (kind, refId) a favorite for the given shared team?
 */
export function useIsSharedTeamFavorite(sharedTeamId: string, kind: SharedTeamFavoriteKind, refId: string): boolean {
  const favs = useSharedTeamFavorites(sharedTeamId);
  return (kind === "team" ? favs.teams : favs.events).includes(refId);
}
