import { useSyncExternalStore } from "react";
import { supabase } from "./supabase";

// Per-org, per-event shared picklist store.
// localStorage is the primary store — changes are instant and persist across
// refreshes regardless of Supabase status. Supabase is a sync layer for
// cross-device sharing; failures are logged silently and never revert local state.

export type PicklistEntry = {
  id: string;          // UUID from DB (or "temp-{teamId}" before Supabase confirms)
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

// ── localStorage helpers ────────────────────────────────────────────────────

function lsKey(orgId: string, eventId: string) {
  return `picklist:${orgId}:${eventId}`;
}

function readLS(orgId: string, eventId: string): PicklistEntry[] {
  try {
    const raw = localStorage.getItem(lsKey(orgId, eventId));
    return raw ? (JSON.parse(raw) as PicklistEntry[]) : [];
  } catch {
    return [];
  }
}

function writeLS(orgId: string, eventId: string, entries: PicklistEntry[]) {
  try {
    localStorage.setItem(lsKey(orgId, eventId), JSON.stringify(entries));
  } catch { /* ignore quota errors */ }
}

// ── Internal state ──────────────────────────────────────────────────────────

function setState(orgId: string, eventId: string, patch: Partial<PicklistState>) {
  const key = cacheKey(orgId, eventId);
  const prev = cache.get(key) ?? EMPTY;
  const next = { ...prev, ...patch };
  cache.set(key, next);
  // Persist entries to localStorage whenever they change
  if ("entries" in patch) {
    writeLS(orgId, eventId, next.entries);
  }
  emit();
}

// Clear cache on sign-out (localStorage intentionally kept — data is device-local)
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
  const key = cacheKey(orgId, eventId);
  if (loading.has(key)) return;
  loading.add(key);

  // 1. Initialize from localStorage immediately so the UI is ready right away
  const lsEntries = readLS(orgId, eventId);
  setState(orgId, eventId, { entries: lsEntries, ready: true });

  // 2. Try to sync from Supabase (best-effort — may be unavailable)
  const sb = supabase;
  if (sb) {
    try {
      const { data, error } = await sb
        .from("org_picklists")
        .select("id, team_id, team_number, team_name, sort_order, notes, crossed_out")
        .eq("org_id", orgId)
        .eq("event_id", eventId)
        .order("sort_order", { ascending: true });

      if (!error && data) {
        const sbEntries: PicklistEntry[] = data.map((row: {
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

        // Merge: build by teamId, localStorage first so local adds survive,
        // then Supabase overwrites so server state (notes, crossedOut, sortOrder) wins.
        if (sbEntries.length > 0) {
          const merged = new Map<string, PicklistEntry>();
          for (const e of lsEntries) merged.set(e.teamId, e);
          for (const e of sbEntries) merged.set(e.teamId, e);
          const mergedArr = [...merged.values()].sort((a, b) => a.sortOrder - b.sortOrder);
          setState(orgId, eventId, { entries: mergedArr, ready: true });
        }
        // If Supabase returns empty, keep localStorage data — don't clear it
        // (could be an RLS policy returning empty instead of an error)
      }
    } catch (err) {
      console.warn("[picklist] Supabase sync failed, using localStorage:", err);
    }
  }

  loading.delete(key);
}

// ── Public actions ─────────────────────────────────────────────────────────────

/** Add a team to the picklist. No-op if already present. */
export async function addToPicklist(
  orgId: string,
  eventId: string,
  team: { teamId: string; teamNumber: string; teamName?: string },
): Promise<void> {
  const prev = getState(orgId, eventId);
  if (prev.entries.some((e) => e.teamId === team.teamId)) return;

  const newSortOrder = prev.entries.length > 0
    ? Math.max(...prev.entries.map((e) => e.sortOrder)) + 1000
    : 1000;

  const tempEntry: PicklistEntry = {
    id: `temp-${team.teamId}`,
    teamId: team.teamId,
    teamNumber: team.teamNumber,
    teamName: team.teamName,
    sortOrder: newSortOrder,
    notes: "",
    crossedOut: false,
  };

  // Optimistic update — persisted to localStorage immediately
  setState(orgId, eventId, { entries: [...prev.entries, tempEntry] });

  // Try to sync to Supabase in background
  const sb = supabase;
  if (!sb) return;
  try {
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

    if (!error && data) {
      // Replace temp id with real UUID
      const current = getState(orgId, eventId);
      setState(orgId, eventId, {
        entries: current.entries.map((e) =>
          e.id === tempEntry.id ? { ...e, id: data.id } : e,
        ),
      });
    } else if (error) {
      console.warn("[picklist] Supabase add failed (local state kept):", error.message);
    }
  } catch (err) {
    console.warn("[picklist] Supabase add error (local state kept):", err);
  }
}

/** Remove a team from the picklist. */
export async function removeFromPicklist(
  orgId: string,
  eventId: string,
  teamId: string,
): Promise<void> {
  const prev = getState(orgId, eventId);
  // Remove immediately — localStorage updated via setState
  setState(orgId, eventId, { entries: prev.entries.filter((e) => e.teamId !== teamId) });

  const sb = supabase;
  if (!sb) return;
  try {
    const { error } = await sb
      .from("org_picklists")
      .delete()
      .eq("org_id", orgId)
      .eq("event_id", eventId)
      .eq("team_id", teamId);
    if (error) console.warn("[picklist] Supabase remove failed (local state kept):", error.message);
  } catch (err) {
    console.warn("[picklist] Supabase remove error (local state kept):", err);
  }
}

/** Reorder the picklist. newOrder is the full desired order;
 *  assigns sort_order = (index + 1) * 1000 and bulk-upserts. */
export async function reorderPicklist(
  orgId: string,
  eventId: string,
  newOrder: PicklistEntry[],
): Promise<void> {
  const updated = newOrder.map((e, i) => ({ ...e, sortOrder: (i + 1) * 1000 }));
  // Apply immediately — localStorage updated via setState
  setState(orgId, eventId, { entries: updated });

  const sb = supabase;
  if (!sb) return;
  try {
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
    if (error) console.warn("[picklist] Supabase reorder failed (local state kept):", error.message);
  } catch (err) {
    console.warn("[picklist] Supabase reorder error (local state kept):", err);
  }
}

/** Save inline notes for a team. */
export async function updatePicklistNotes(
  orgId: string,
  eventId: string,
  teamId: string,
  notes: string,
): Promise<void> {
  const prev = getState(orgId, eventId);
  setState(orgId, eventId, {
    entries: prev.entries.map((e) => e.teamId === teamId ? { ...e, notes } : e),
  });

  const sb = supabase;
  if (!sb) return;
  try {
    const { error } = await sb
      .from("org_picklists")
      .update({ notes })
      .eq("org_id", orgId)
      .eq("event_id", eventId)
      .eq("team_id", teamId);
    if (error) console.warn("[picklist] Supabase notes update failed:", error.message);
  } catch (err) {
    console.warn("[picklist] Supabase notes error:", err);
  }
}

/** Toggle the crossed-out state for a team. */
export async function toggleCrossedOut(
  orgId: string,
  eventId: string,
  teamId: string,
): Promise<void> {
  const prev = getState(orgId, eventId);
  const entry = prev.entries.find((e) => e.teamId === teamId);
  if (!entry) return;

  const newVal = !entry.crossedOut;
  setState(orgId, eventId, {
    entries: prev.entries.map((e) => e.teamId === teamId ? { ...e, crossedOut: newVal } : e),
  });

  const sb = supabase;
  if (!sb) return;
  try {
    const { error } = await sb
      .from("org_picklists")
      .update({ crossed_out: newVal })
      .eq("org_id", orgId)
      .eq("event_id", eventId)
      .eq("team_id", teamId);
    if (error) console.warn("[picklist] Supabase crossedOut update failed:", error.message);
  } catch (err) {
    console.warn("[picklist] Supabase crossedOut error:", err);
  }
}

/** Clear all crossed-out states for an event picklist. */
export async function clearCrossedOut(orgId: string, eventId: string): Promise<void> {
  const prev = getState(orgId, eventId);
  setState(orgId, eventId, {
    entries: prev.entries.map((e) => ({ ...e, crossedOut: false })),
  });

  const sb = supabase;
  if (!sb) return;
  try {
    const { error } = await sb
      .from("org_picklists")
      .update({ crossed_out: false })
      .eq("org_id", orgId)
      .eq("event_id", eventId);
    if (error) console.warn("[picklist] Supabase clearCrossedOut failed:", error.message);
  } catch (err) {
    console.warn("[picklist] Supabase clearCrossedOut error:", err);
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
