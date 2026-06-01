import { useSyncExternalStore } from "react";
import { supabase } from "./supabase";

// Per-org shared favorites store.
// Lazy-loaded: fetches from Supabase the first time a component subscribes to
// a given orgId. Cached in a module-level Map until sign-out.
// Optimistic toggle: update Map entry immediately, fire upsert/delete in
// background, revert on error — same pattern as favorites.ts.

export type OrgFavoriteKind = "team" | "event";

type OrgFavState = {
  teams: string[];
  events: string[];
  ready: boolean;
};

// Module-level Map: orgId → state for that org
const cache = new Map<string, OrgFavState>();
// Track which orgIds are currently being fetched (avoid duplicate requests)
const loading = new Set<string>();

const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function getForOrg(orgId: string): OrgFavState {
  return cache.get(orgId) ?? { teams: [], events: [], ready: false };
}

function setForOrg(orgId: string, patch: Partial<OrgFavState>) {
  const prev = cache.get(orgId) ?? { teams: [], events: [], ready: false };
  cache.set(orgId, { ...prev, ...patch });
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

async function loadForOrg(orgId: string): Promise<void> {
  const sb = supabase;
  if (!sb || loading.has(orgId)) return;
  loading.add(orgId);

  const { data } = await sb
    .from("org_favorites")
    .select("kind, ref_id")
    .eq("org_id", orgId);

  const teams: string[] = [];
  const events: string[] = [];
  for (const row of (data ?? []) as Array<{ kind: string; ref_id: string }>) {
    if (row.kind === "team") teams.push(row.ref_id);
    else if (row.kind === "event") events.push(row.ref_id);
  }

  setForOrg(orgId, { teams, events, ready: true });
  loading.delete(orgId);
}

// ── Public actions ────────────────────────────────────────────────────────────

/**
 * Toggle an org favorite. Optimistic: updates immediately, reverts on error.
 */
export async function toggleOrgFavorite(
  orgId: string,
  kind: OrgFavoriteKind,
  refId: string,
): Promise<void> {
  const sb = supabase;
  if (!sb) return;

  const prev = getForOrg(orgId);
  const arr = kind === "team" ? prev.teams : prev.events;
  const has = arr.includes(refId);

  // Optimistic update
  if (has) {
    setForOrg(orgId, { [kind === "team" ? "teams" : "events"]: arr.filter((id) => id !== refId) });
  } else {
    setForOrg(orgId, { [kind === "team" ? "teams" : "events"]: [...arr, refId] });
  }

  const revert = () => {
    setForOrg(orgId, { [kind === "team" ? "teams" : "events"]: arr });
  };

  if (has) {
    const { error } = await sb
      .from("org_favorites")
      .delete()
      .eq("org_id", orgId)
      .eq("kind", kind)
      .eq("ref_id", refId);
    if (error) revert();
  } else {
    const { data: session } = await sb.auth.getSession();
    const uid = session.session?.user?.id ?? null;
    const { error } = await sb
      .from("org_favorites")
      .upsert({ org_id: orgId, kind, ref_id: refId, added_by: uid }, { onConflict: "org_id,kind,ref_id" });
    if (error) revert();
  }
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

/**
 * Returns the shared favorites for an org. Triggers a lazy fetch on first call
 * for each orgId.
 */
export function useOrgFavorites(orgId: string): OrgFavState {
  // Trigger load if not yet started
  const current = cache.get(orgId);
  if (!current && !loading.has(orgId)) {
    void loadForOrg(orgId);
  }

  const getSnapshot = () => getForOrg(orgId);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Boolean: is this (kind, refId) an org favorite for the given org?
 */
export function useIsOrgFavorite(orgId: string, kind: OrgFavoriteKind, refId: string): boolean {
  const favs = useOrgFavorites(orgId);
  return (kind === "team" ? favs.teams : favs.events).includes(refId);
}
