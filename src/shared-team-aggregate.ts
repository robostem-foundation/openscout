import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { api } from "./api";
import { getSharedTeamMembers } from "./shared-teams";
import { listSharedTeamPicklistEvents } from "./picklist";
import type { SharedTeamPicklistSummary } from "./picklist";
import type { Event } from "./types";

// Shared shared-team-workspace queries that don't belong to a single-purpose store:
//  - useEventNames: batch-resolve RobotEvents event names (one request, cached)
//  - loadSharedTeamActivity: a recent-activity feed derived from existing tables
//  - useSharedTeamPicklistEvents: thin reactive wrapper over listSharedTeamPicklistEvents

// ── Event-name resolution (shared batch + module cache) ──────────────────────

const eventCache = new Map<string, Event>();
const eventInflight = new Set<string>();

async function fetchEvents(ids: string[]): Promise<void> {
  const missing = ids.filter((id) => id && !eventCache.has(id) && !eventInflight.has(id));
  if (missing.length === 0) return;
  missing.forEach((id) => eventInflight.add(id));
  try {
    // RobotEvents supports the id[] array param (same shape the app already uses
    // for sku[]/program[]). One request resolves the whole batch.
    const numeric = missing.map((id) => Number(id)).filter((n) => Number.isFinite(n));
    const res = await api.events({ "id[]": numeric, per_page: 250 });
    for (const ev of res.data ?? []) eventCache.set(String(ev.id), ev);
  } catch {
    // Fallback: resolve per id (bounded by the missing count).
    await Promise.all(
      missing.map(async (id) => {
        try {
          const ev = await api.event(id);
          eventCache.set(id, ev);
        } catch { /* ignore — leave unresolved */ }
      }),
    );
  } finally {
    missing.forEach((id) => eventInflight.delete(id));
  }
}

/**
 * Resolves a set of event ids to Event objects via one batched request, caching
 * results across the workspace (Notes hub, Picklists overview, Activity, Export).
 * Returns a Map keyed by id; value is null until resolved (or if unresolvable).
 */
export function useEventNames(eventIds: (string | null | undefined)[]): Map<string, Event | null> {
  const ids = Array.from(new Set(eventIds.filter((x): x is string => Boolean(x))));
  const key = [...ids].sort().join(",");
  const [, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (ids.some((id) => !eventCache.has(id))) {
      void fetchEvents(ids).then(() => {
        if (!cancelled) setTick((t) => t + 1);
      });
    }
    return () => { cancelled = true; };
  }, [key]);

  const map = new Map<string, Event | null>();
  for (const id of ids) map.set(id, eventCache.get(id) ?? null);
  return map;
}

/** Event display name from the shared cache, or a stable fallback. */
export function eventDisplayName(eventId: string | null | undefined): string {
  if (!eventId) return "No event";
  return eventCache.get(eventId)?.name ?? `Event ${eventId}`;
}

// ── Recent activity feed (derived from existing tables) ──────────────────────

export type ActivityKind = "note" | "picklist" | "favorite";

export type ActivityItem = {
  kind: ActivityKind;
  ts: string;               // ISO timestamp
  userId: string | null;
  userName: string;         // resolved via getSharedTeamMembers
  eventId: string | null;   // for click-through, when known
  matchId?: string;
  teamNumber?: string;
  refKind?: "team" | "event";
  refId?: string;
};

/**
 * Builds a recent-activity feed by merging the newest rows from shared_team_match_notes,
 * shared_team_picklists, and shared_team_favorites. This is "recent state", not an audit log:
 * deletes leave no trace and notes only carry updated_at. No new table needed —
 * every select rides the existing private.is_shared_team_member RLS policy.
 */
export async function loadSharedTeamActivity(sharedTeamId: string, limit = 50): Promise<ActivityItem[]> {
  const sb = supabase;
  if (!sb) return [];

  const [notesRes, picksRes, favsRes, members] = await Promise.all([
    sb.from("shared_team_match_notes")
      .select("match_id, event_id, updated_at, last_edited_by")
      .eq("shared_team_id", sharedTeamId).order("updated_at", { ascending: false }).limit(limit),
    sb.from("shared_team_picklists")
      .select("event_id, team_number, added_by, created_at")
      .eq("shared_team_id", sharedTeamId).order("created_at", { ascending: false }).limit(limit),
    sb.from("shared_team_favorites")
      .select("kind, ref_id, added_by, created_at")
      .eq("shared_team_id", sharedTeamId).order("created_at", { ascending: false }).limit(limit),
    getSharedTeamMembers(sharedTeamId),
  ]);

  const nameById = new Map<string, string>();
  for (const m of members) nameById.set(m.userId, m.displayName);
  const resolveName = (uid: string | null) => (uid ? nameById.get(uid) : null) ?? "A teammate";

  const items: ActivityItem[] = [];

  for (const r of (notesRes.data ?? []) as Array<{ match_id: string; event_id: string | null; updated_at: string | null; last_edited_by: string | null }>) {
    if (!r.updated_at) continue;
    items.push({ kind: "note", ts: r.updated_at, userId: r.last_edited_by, userName: resolveName(r.last_edited_by), eventId: r.event_id, matchId: String(r.match_id) });
  }
  for (const r of (picksRes.data ?? []) as Array<{ event_id: string; team_number: string; added_by: string | null; created_at: string | null }>) {
    if (!r.created_at) continue;
    items.push({ kind: "picklist", ts: r.created_at, userId: r.added_by, userName: resolveName(r.added_by), eventId: r.event_id, teamNumber: r.team_number });
  }
  for (const r of (favsRes.data ?? []) as Array<{ kind: string; ref_id: string; added_by: string | null; created_at: string | null }>) {
    if (!r.created_at) continue;
    const refKind = r.kind === "event" ? "event" : "team";
    items.push({ kind: "favorite", ts: r.created_at, userId: r.added_by, userName: resolveName(r.added_by), eventId: refKind === "event" ? r.ref_id : null, refKind, refId: r.ref_id });
  }

  items.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
  return items.slice(0, limit);
}

// ── Picklist enumeration hook ────────────────────────────────────────────────

/** Reactive wrapper over listSharedTeamPicklistEvents. Re-runs when sharedTeamId changes. */
export function useSharedTeamPicklistEvents(sharedTeamId: string): { data: SharedTeamPicklistSummary[]; loading: boolean } {
  const [data, setData] = useState<SharedTeamPicklistSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void listSharedTeamPicklistEvents(sharedTeamId).then((res) => {
      if (!cancelled) { setData(res); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [sharedTeamId]);

  return { data, loading };
}
