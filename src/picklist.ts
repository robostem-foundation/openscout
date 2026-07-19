import { useSyncExternalStore } from "react";
import { supabase } from "./supabase";

// Per-shared-team, per-event shared picklist store.
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

// Cache key: "${sharedTeamId}|${eventId}"
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

function cacheKey(sharedTeamId: string, eventId: string) {
  return `${sharedTeamId}|${eventId}`;
}

function getState(sharedTeamId: string, eventId: string): PicklistState {
  return cache.get(cacheKey(sharedTeamId, eventId)) ?? EMPTY;
}

// ── localStorage helpers ────────────────────────────────────────────────────

function lsKey(sharedTeamId: string, eventId: string) {
  return `picklist:${sharedTeamId}:${eventId}`;
}

function readLS(sharedTeamId: string, eventId: string): PicklistEntry[] {
  try {
    const raw = localStorage.getItem(lsKey(sharedTeamId, eventId));
    return raw ? (JSON.parse(raw) as PicklistEntry[]) : [];
  } catch {
    return [];
  }
}

function writeLS(sharedTeamId: string, eventId: string, entries: PicklistEntry[]) {
  try {
    localStorage.setItem(lsKey(sharedTeamId, eventId), JSON.stringify(entries));
  } catch { /* ignore quota errors */ }
}

// ── Internal state ──────────────────────────────────────────────────────────

function setState(sharedTeamId: string, eventId: string, patch: Partial<PicklistState>) {
  const key = cacheKey(sharedTeamId, eventId);
  const prev = cache.get(key) ?? EMPTY;
  const next = { ...prev, ...patch };
  cache.set(key, next);
  // Persist entries to localStorage whenever they change
  if ("entries" in patch) {
    writeLS(sharedTeamId, eventId, next.entries);
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

async function loadForKey(sharedTeamId: string, eventId: string): Promise<void> {
  const key = cacheKey(sharedTeamId, eventId);
  if (loading.has(key)) return;
  loading.add(key);

  // 1. Initialize from localStorage immediately so the UI is ready right away
  const lsEntries = readLS(sharedTeamId, eventId);
  setState(sharedTeamId, eventId, { entries: lsEntries, ready: true });

  // 2. Try to sync from Supabase (best-effort — may be unavailable)
  const sb = supabase;
  if (sb) {
    try {
      const { data, error } = await sb
        .from("shared_team_picklists")
        .select("id, team_id, team_number, team_name, sort_order, notes, crossed_out")
        .eq("shared_team_id", sharedTeamId)
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
          setState(sharedTeamId, eventId, { entries: mergedArr, ready: true });
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
  sharedTeamId: string,
  eventId: string,
  team: { teamId: string; teamNumber: string; teamName?: string },
): Promise<void> {
  const prev = getState(sharedTeamId, eventId);
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
  setState(sharedTeamId, eventId, { entries: [...prev.entries, tempEntry] });

  // Try to sync to Supabase in background
  const sb = supabase;
  if (!sb) return;
  try {
    const { data: session } = await sb.auth.getSession();
    const uid = session.session?.user?.id ?? null;

    const { data, error } = await sb
      .from("shared_team_picklists")
      .upsert({
        shared_team_id: sharedTeamId,
        event_id: eventId,
        team_id: team.teamId,
        team_number: team.teamNumber,
        team_name: team.teamName ?? null,
        sort_order: newSortOrder,
        notes: "",
        crossed_out: false,
        added_by: uid,
      }, { onConflict: "shared_team_id,event_id,team_id" })
      .select("id")
      .single();

    if (!error && data) {
      // Replace temp id with real UUID
      const current = getState(sharedTeamId, eventId);
      setState(sharedTeamId, eventId, {
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
  sharedTeamId: string,
  eventId: string,
  teamId: string,
): Promise<void> {
  const prev = getState(sharedTeamId, eventId);
  // Remove immediately — localStorage updated via setState
  setState(sharedTeamId, eventId, { entries: prev.entries.filter((e) => e.teamId !== teamId) });

  const sb = supabase;
  if (!sb) return;
  try {
    const { error } = await sb
      .from("shared_team_picklists")
      .delete()
      .eq("shared_team_id", sharedTeamId)
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
  sharedTeamId: string,
  eventId: string,
  newOrder: PicklistEntry[],
): Promise<void> {
  const updated = newOrder.map((e, i) => ({ ...e, sortOrder: (i + 1) * 1000 }));
  // Apply immediately — localStorage updated via setState
  setState(sharedTeamId, eventId, { entries: updated });

  const sb = supabase;
  if (!sb) return;
  try {
    const rows = updated.map((e) => ({
      id: e.id,
      shared_team_id: sharedTeamId,
      event_id: eventId,
      team_id: e.teamId,
      team_number: e.teamNumber,
      team_name: e.teamName ?? null,
      sort_order: e.sortOrder,
      notes: e.notes,
      crossed_out: e.crossedOut,
    }));
    const { error } = await sb
      .from("shared_team_picklists")
      .upsert(rows, { onConflict: "shared_team_id,event_id,team_id" });
    if (error) console.warn("[picklist] Supabase reorder failed (local state kept):", error.message);
  } catch (err) {
    console.warn("[picklist] Supabase reorder error (local state kept):", err);
  }
}

/** Save inline notes for a team. */
export async function updatePicklistNotes(
  sharedTeamId: string,
  eventId: string,
  teamId: string,
  notes: string,
): Promise<void> {
  const prev = getState(sharedTeamId, eventId);
  setState(sharedTeamId, eventId, {
    entries: prev.entries.map((e) => e.teamId === teamId ? { ...e, notes } : e),
  });

  const sb = supabase;
  if (!sb) return;
  try {
    const { error } = await sb
      .from("shared_team_picklists")
      .update({ notes })
      .eq("shared_team_id", sharedTeamId)
      .eq("event_id", eventId)
      .eq("team_id", teamId);
    if (error) console.warn("[picklist] Supabase notes update failed:", error.message);
  } catch (err) {
    console.warn("[picklist] Supabase notes error:", err);
  }
}

/** Toggle the crossed-out state for a team. */
export async function toggleCrossedOut(
  sharedTeamId: string,
  eventId: string,
  teamId: string,
): Promise<void> {
  const prev = getState(sharedTeamId, eventId);
  const entry = prev.entries.find((e) => e.teamId === teamId);
  if (!entry) return;

  const newVal = !entry.crossedOut;
  setState(sharedTeamId, eventId, {
    entries: prev.entries.map((e) => e.teamId === teamId ? { ...e, crossedOut: newVal } : e),
  });

  const sb = supabase;
  if (!sb) return;
  try {
    const { error } = await sb
      .from("shared_team_picklists")
      .update({ crossed_out: newVal })
      .eq("shared_team_id", sharedTeamId)
      .eq("event_id", eventId)
      .eq("team_id", teamId);
    if (error) console.warn("[picklist] Supabase crossedOut update failed:", error.message);
  } catch (err) {
    console.warn("[picklist] Supabase crossedOut error:", err);
  }
}

/** Clear all crossed-out states for an event picklist. */
export async function clearCrossedOut(sharedTeamId: string, eventId: string): Promise<void> {
  const prev = getState(sharedTeamId, eventId);
  setState(sharedTeamId, eventId, {
    entries: prev.entries.map((e) => ({ ...e, crossedOut: false })),
  });

  const sb = supabase;
  if (!sb) return;
  try {
    const { error } = await sb
      .from("shared_team_picklists")
      .update({ crossed_out: false })
      .eq("shared_team_id", sharedTeamId)
      .eq("event_id", eventId);
    if (error) console.warn("[picklist] Supabase clearCrossedOut failed:", error.message);
  } catch (err) {
    console.warn("[picklist] Supabase clearCrossedOut error:", err);
  }
}

// ── Shared-team-wide enumeration ────────────────────────────────────────────

export type SharedTeamPicklistSummary = {
  eventId: string;
  teamCount: number;
  topTeams: { teamNumber: string; teamName?: string }[];
};

/**
 * Enumerate every event this shared team has a picklist for, with a top-team
 * preview. Unions Supabase rows (cross-device) with localStorage (offline /
 * signed-out), deduping by (eventId, teamNumber). Used by the shared team
 * workspace overview — there is no per-(sharedTeam,event) cache to read from
 * here, so this queries directly.
 */
export async function listSharedTeamPicklistEvents(sharedTeamId: string, topN = 3): Promise<SharedTeamPicklistSummary[]> {
  type Row = { teamNumber: string; teamName?: string; sortOrder: number };
  const byEvent = new Map<string, Row[]>();

  const add = (eventId: string, row: Row) => {
    const arr = byEvent.get(eventId) ?? [];
    if (!arr.some((x) => x.teamNumber === row.teamNumber)) arr.push(row);
    byEvent.set(eventId, arr);
  };

  // 1. localStorage scan — primary store, always present for offline/signed-out
  try {
    const prefix = `picklist:${sharedTeamId}:`;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(prefix)) continue;
      const eventId = key.slice(prefix.length);
      for (const e of readLS(sharedTeamId, eventId)) {
        add(eventId, { teamNumber: e.teamNumber, teamName: e.teamName, sortOrder: e.sortOrder });
      }
    }
  } catch { /* ignore */ }

  // 2. Supabase — cross-device sync layer
  const sb = supabase;
  if (sb) {
    try {
      const { data, error } = await sb
        .from("shared_team_picklists")
        .select("event_id, team_number, team_name, sort_order")
        .eq("shared_team_id", sharedTeamId)
        .order("sort_order", { ascending: true });
      if (!error && data) {
        for (const row of data as Array<{ event_id: string; team_number: string; team_name: string | null; sort_order: number }>) {
          add(row.event_id, { teamNumber: row.team_number, teamName: row.team_name ?? undefined, sortOrder: row.sort_order });
        }
      }
    } catch (err) {
      console.warn("[picklist] listSharedTeamPicklistEvents sync failed (localStorage only):", err);
    }
  }

  const out: SharedTeamPicklistSummary[] = [];
  for (const [eventId, rows] of byEvent) {
    const sorted = [...rows].sort((a, b) => a.sortOrder - b.sortOrder);
    out.push({
      eventId,
      teamCount: sorted.length,
      topTeams: sorted.slice(0, topN).map((e) => ({ teamNumber: e.teamNumber, teamName: e.teamName })),
    });
  }
  out.sort((a, b) => b.teamCount - a.teamCount);
  return out;
}

/**
 * Full picklist entries for every event the shared team has a picklist for, grouped by
 * event. Unions localStorage + Supabase (deduped by teamId, Supabase fields win).
 * Used by the workspace Export tab where the complete rows (notes, crossedOut)
 * are needed, not just a preview.
 */
export async function loadSharedTeamPicklistEntries(sharedTeamId: string): Promise<Array<{ eventId: string; entries: PicklistEntry[] }>> {
  const byEvent = new Map<string, Map<string, PicklistEntry>>();
  const slot = (eventId: string) => {
    let m = byEvent.get(eventId);
    if (!m) { m = new Map(); byEvent.set(eventId, m); }
    return m;
  };

  // 1. localStorage (primary)
  try {
    const prefix = `picklist:${sharedTeamId}:`;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(prefix)) continue;
      const eventId = key.slice(prefix.length);
      const m = slot(eventId);
      for (const e of readLS(sharedTeamId, eventId)) m.set(e.teamId, e);
    }
  } catch { /* ignore */ }

  // 2. Supabase (server fields win)
  const sb = supabase;
  if (sb) {
    try {
      const { data, error } = await sb
        .from("shared_team_picklists")
        .select("id, event_id, team_id, team_number, team_name, sort_order, notes, crossed_out")
        .eq("shared_team_id", sharedTeamId)
        .order("sort_order", { ascending: true });
      if (!error && data) {
        for (const row of data as Array<{ id: string; event_id: string; team_id: string; team_number: string; team_name: string | null; sort_order: number; notes: string | null; crossed_out: boolean }>) {
          slot(row.event_id).set(row.team_id, {
            id: row.id,
            teamId: row.team_id,
            teamNumber: row.team_number,
            teamName: row.team_name ?? undefined,
            sortOrder: row.sort_order,
            notes: row.notes ?? "",
            crossedOut: row.crossed_out,
          });
        }
      }
    } catch (err) {
      console.warn("[picklist] loadSharedTeamPicklistEntries sync failed (localStorage only):", err);
    }
  }

  return [...byEvent.entries()].map(([eventId, m]) => ({
    eventId,
    entries: [...m.values()].sort((a, b) => a.sortOrder - b.sortOrder),
  }));
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

/** Returns the picklist state for a sharedTeam+event. Triggers lazy load on first call. */
export function usePicklist(sharedTeamId: string, eventId: string): PicklistState {
  const key = cacheKey(sharedTeamId, eventId);
  const current = cache.get(key);
  if (!current && !loading.has(key)) {
    void loadForKey(sharedTeamId, eventId);
  }

  const getSnapshot = () => getState(sharedTeamId, eventId);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Boolean: is this teamId in the picklist for the given sharedTeam+event? */
export function useIsInPicklist(sharedTeamId: string, eventId: string, teamId: string): boolean {
  const { entries } = usePicklist(sharedTeamId, eventId);
  return entries.some((e) => e.teamId === teamId);
}
