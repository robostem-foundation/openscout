import { useSyncExternalStore } from "react";
import { supabase } from "./supabase";

// Per-org, per-event shared picklist store.
// Lazy-loaded: fetches from Supabase the first time a component subscribes to
// a given (orgId, eventId) pair. Cached in a module-level Map until sign-out.
// Optimistic updates: modify cache immediately, sync in background, revert on error.
// Same module-level + epoch pattern as org-favorites.ts.

export type PicklistEntry = {
  id: string;          // UUID from DB
  teamId: string;      // RobotEvents team id as text
  teamNumber: string;  // "12345A"
  teamName?: string;   // optional, denormalized at add time
  sortOrder: number;
  notes: string;
  crossedOut: boolean;
};

type PicklistState = { entries: PicklistEntry[]; ready: boolean };

// Cache key: "${orgId}|${eventId}"
const cache = new Map<string, PicklistState>();
const loading = new Set<string>();
const EMPTY: PicklistState = { entries: [], ready: false };

const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function cacheKey(orgId: string, eventId: string) {
  return `${orgId}|${eventId}`;
}

function getState(orgId: string, eventId: string): PicklistState {
  return cache.get(cacheKey(orgId, eventId)) ?? EMPTY;
}

function setState(orgId: string, eventId: string, patch: Partial<PicklistState>) {
  const key = cacheKey(orgId, eventId);
  const prev = cache.get(key) ?? EMPTY;
  cache.set(key, { ...prev, ...patch });
  emit();
}

// Clear cache on sign-out
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

async function loadForKey(orgId: string, eventId: string): Promise<void> {
  const sb = supabase;
  const key = cacheKey(orgId, eventId);
  if (!sb || loading.has(key)) return;
  loading.add(key);

  const { data } = await sb
    .from("org_picklists")
    .select("id, team_id, team_number, team_name, sort_order, notes, crossed_out")
    .eq("org_id", orgId)
    .eq("event_id", eventId)
    .order("sort_order", { ascending: true });

  const entries: PicklistEntry[] = (data ?? []).map((row: {
    id: string;
    team_id: string;
    team_number: string;
    team_name: string | null;
    sort_order: number;
    notes: string | null;
    crossed_out: boolean;
  }) => ({
    id: row.id,
    teamId: row.team_id,
    teamNumber: row.team_number,
    teamName: row.team_name ?? undefined,
    sortOrder: row.sort_order,
    notes: row.notes ?? "",
    crossedOut: row.crossed_out,
  }));

  setState(orgId, eventId, { entries, ready: true });
  loading.delete(key);
}

// ── Public actions ─────────────────────────────────────────────────────────────

/** Add a team to the picklist. No-op if already present. */
export async function addToPicklist(
  orgId: string,
  eventId: string,
  team: { teamId: string; teamNumber: string; teamName?: string },
): Promise<void> {
  const sb = supabase;
  if (!sb) return;

  const prev = getState(orgId, eventId);
  if (prev.entries.some((e) => e.teamId === team.teamId)) return;

  const newSortOrder = prev.entries.length > 0
    ? Math.max(...prev.entries.map((e) => e.sortOrder)) + 1000
    : 1000;

  // Optimistic: add with a temp id
  const tempEntry: PicklistEntry = {
    id: `temp-${team.teamId}`,
    teamId: team.teamId,
    teamNumber: team.teamNumber,
    teamName: team.teamName,
    sortOrder: newSortOrder,
    notes: "",
    crossedOut: false,
  };
  setState(orgId, eventId, { entries: [...prev.entries, tempEntry] });

  const { data: session } = await sb.auth.getSession();
  const uid = session.session?.user?.id ?? null;

  const { data, error } = await sb
    .from("org_picklists")
    .upsert({
      org_id: orgId,
      event_id: eventId,
      team_id: team.teamId,
      team_number: team.teamNumber,
      team_name: team.teamName ?? null,
      sort_order: newSortOrder,
      notes: "",
      crossed_out: false,
      added_by: uid,
    }, { onConflict: "org_id,event_id,team_id" })
    .select("id")
    .single();

  if (error) {
    // Revert
    setState(orgId, eventId, { entries: prev.entries });
  } else if (data) {
    // Replace temp id with real UUID
    const updated = getState(orgId, eventId);
    setState(orgId, eventId, {
      entries: updated.entries.map((e) =>
        e.id === tempEntry.id ? { ...e, id: data.id } : e,
      ),
    });
  }
}

/** Remove a team from the picklist. */
export async function removeFromPicklist(
  orgId: string,
  eventId: string,
  teamId: string,
): Promise<void> {
  const sb = supabase;
  if (!sb) return;

  const prev = getState(orgId, eventId);
  setState(orgId, eventId, { entries: prev.entries.filter((e) => e.teamId !== teamId) });

  const { error } = await sb
    .from("org_picklists")
    .delete()
    .eq("org_id", orgId)
    .eq("event_id", eventId)
    .eq("team_id", teamId);

  if (error) {
    setState(orgId, eventId, { entries: prev.entries });
  }
}

/** Reorder the picklist. newOrder is the full desired order;
 *  assigns sort_order = (index + 1) * 1000 and bulk-upserts. */
export async function reorderPicklist(
  orgId: string,
  eventId: string,
  newOrder: PicklistEntry[],
): Promise<void> {
  const sb = supabase;
  if (!sb) return;

  const prev = getState(orgId, eventId);
  const updated = newOrder.map((e, i) => ({ ...e, sortOrder: (i + 1) * 1000 }));
  setState(orgId, eventId, { entries: updated });

  const rows = updated.map((e) => ({
    id: e.id,
    org_id: orgId,
    event_id: eventId,
    team_id: e.teamId,
    team_number: e.teamNumber,
    team_name: e.teamName ?? null,
    sort_order: e.sortOrder,
    notes: e.notes,
    crossed_out: e.crossedOut,
  }));

  const { error } = await sb
    .from("org_picklists")
    .upsert(rows, { onConflict: "org_id,event_id,team_id" });

  if (error) {
    setState(orgId, eventId, { entries: prev.entries });
  }
}

/** Save inline notes for a team. */
export async function updatePicklistNotes(
  orgId: string,
  eventId: string,
  teamId: string,
  notes: string,
): Promise<void> {
  const sb = supabase;
  if (!sb) return;

  const prev = getState(orgId, eventId);
  setState(orgId, eventId, {
    entries: prev.entries.map((e) => e.teamId === teamId ? { ...e, notes } : e),
  });

  const { error } = await sb
    .from("org_picklists")
    .update({ notes })
    .eq("org_id", orgId)
    .eq("event_id", eventId)
    .eq("team_id", teamId);

  if (error) {
    setState(orgId, eventId, { entries: prev.entries });
  }
}

/** Toggle the crossed-out state for a team. */
export async function toggleCrossedOut(
  orgId: string,
  eventId: string,
  teamId: string,
): Promise<void> {
  const sb = supabase;
  if (!sb) return;

  const prev = getState(orgId, eventId);
  const entry = prev.entries.find((e) => e.teamId === teamId);
  if (!entry) return;

  const newVal = !entry.crossedOut;
  setState(orgId, eventId, {
    entries: prev.entries.map((e) => e.teamId === teamId ? { ...e, crossedOut: newVal } : e),
  });

  const { error } = await sb
    .from("org_picklists")
    .update({ crossed_out: newVal })
    .eq("org_id", orgId)
    .eq("event_id", eventId)
    .eq("team_id", teamId);

  if (error) {
    setState(orgId, eventId, { entries: prev.entries });
  }
}

/** Clear all crossed-out states for an event picklist. */
export async function clearCrossedOut(orgId: string, eventId: string): Promise<void> {
  const sb = supabase;
  if (!sb) return;

  const prev = getState(orgId, eventId);
  setState(orgId, eventId, {
    entries: prev.entries.map((e) => ({ ...e, crossedOut: false })),
  });

  const { error } = await sb
    .from("org_picklists")
    .update({ crossed_out: false })
    .eq("org_id", orgId)
    .eq("event_id", eventId);

  if (error) {
    setState(orgId, eventId, { entries: prev.entries });
  }
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

/** Returns the picklist state for an org+event. Triggers lazy load on first call. */
export function usePicklist(orgId: string, eventId: string): PicklistState {
  const key = cacheKey(orgId, eventId);
  const current = cache.get(key);
  if (!current && !loading.has(key)) {
    void loadForKey(orgId, eventId);
  }

  const getSnapshot = () => getState(orgId, eventId);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Boolean: is this teamId in the picklist for the given org+event? */
export function useIsInPicklist(orgId: string, eventId: string, teamId: string): boolean {
  const { entries } = usePicklist(orgId, eventId);
  return entries.some((e) => e.teamId === teamId);
}
