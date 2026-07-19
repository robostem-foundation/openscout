import { useSyncExternalStore } from "react";
import { supabase } from "./supabase";

// Shared team membership store — cloud-only (no localStorage fallback).
// When signed out: sharedTeams=[], ready=true.
// When signed in: fetches the user's shared team memberships once and caches in module state.
// Mirrors the useSyncExternalStore pattern from favorites.ts / notes.ts.

export type SharedTeamRole = "owner" | "admin" | "member";

export type SharedTeamMembership = {
  sharedTeamId: string;
  name: string;
  role: SharedTeamRole;
  teamProgram: string | null;
  teamNumber: string | null;
};

export type SharedTeamInvite = {
  id: string;
  sharedTeamId: string;
  createdBy: string | null;
  usedBy: string | null;
  /** Max number of joins allowed; null = unlimited. */
  maxUses: number | null;
  /** Joins consumed so far. */
  useCount: number;
  /** ISO timestamp, or null = never expires. */
  expiresAt: string | null;
  createdAt: string;
};

export type SharedTeamMember = {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  role: SharedTeamRole;
};

type State = {
  sharedTeams: SharedTeamMembership[];
  ready: boolean;
  signedIn: boolean;
};

let state: State = { sharedTeams: [], ready: false, signedIn: false };

const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function setState(patch: Partial<State>) {
  state = { ...state, ...patch };
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function getState(): State {
  return state;
}

// ── Cloud load ──────────────────────────────────────────────────────────────

let userId: string | null = null;

async function loadCloud(uid: string) {
  const sb = supabase;
  if (!sb) return;
  userId = uid;

  // Fetch memberships with shared team details in one round-trip
  const { data } = await sb
    .from("shared_team_members")
    .select("role, shared_teams(id, name, team_program, team_number)")
    .eq("user_id", uid);

  const sharedTeams: SharedTeamMembership[] = [];
  type MemberRow = {
    role: string;
    shared_teams: { id: string; name: string; team_program: string | null; team_number: string | null } | null;
  };
  for (const row of (data ?? []) as unknown as MemberRow[]) {
    if (!row.shared_teams) continue;
    sharedTeams.push({
      sharedTeamId: row.shared_teams.id,
      name: row.shared_teams.name,
      role: row.role as SharedTeamRole,
      teamProgram: row.shared_teams.team_program,
      teamNumber: row.shared_teams.team_number,
    });
  }

  setState({ sharedTeams, ready: true, signedIn: true });
}

// ── Auth wiring ─────────────────────────────────────────────────────────────

let loadedFor: string | null | undefined = undefined;

function applyAuth(uid: string | null) {
  if (uid === loadedFor) return;
  loadedFor = uid;
  if (uid) {
    void loadCloud(uid);
  } else {
    userId = null;
    setState({ sharedTeams: [], ready: true, signedIn: false });
  }
}

(function init() {
  const sb = supabase;
  if (!sb) {
    setState({ sharedTeams: [], ready: true, signedIn: false });
    return;
  }
  void sb.auth.getSession().then(({ data }) => applyAuth(data.session?.user?.id ?? null));
  sb.auth.onAuthStateChange((_event, session) => applyAuth(session?.user?.id ?? null));
})();

// ── Exported actions ─────────────────────────────────────────────────────────

/** Create a shared team. Returns the new shared team's UUID. */
export async function createSharedTeam(
  name: string,
  teamProgram?: string | null,
  teamNumber?: string | null,
): Promise<string> {
  const sb = supabase;
  if (!sb || !userId) throw new Error("Not signed in");

  // Insert shared team (owner_id set to current user)
  const { data: sharedTeamData, error: sharedTeamError } = await sb
    .from("shared_teams")
    .insert({ name: name.trim(), owner_id: userId, team_program: teamProgram ?? null, team_number: teamNumber ?? null })
    .select("id")
    .single();

  if (sharedTeamError || !sharedTeamData) throw sharedTeamError ?? new Error("Failed to create shared team");
  const sharedTeamId = sharedTeamData.id as string;

  // Add owner as member
  await sb.from("shared_team_members").insert({ shared_team_id: sharedTeamId, user_id: userId, role: "owner" });

  // Optimistic update
  setState({
    sharedTeams: [
      ...state.sharedTeams,
      { sharedTeamId, name: name.trim(), role: "owner", teamProgram: teamProgram ?? null, teamNumber: teamNumber ?? null },
    ],
  });

  return sharedTeamId;
}

/** Update shared team name / team info. */
export async function updateSharedTeam(
  sharedTeamId: string,
  patch: { name?: string; teamProgram?: string | null; teamNumber?: string | null },
): Promise<void> {
  const sb = supabase;
  if (!sb) return;

  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update["name"] = patch.name.trim();
  if (patch.teamProgram !== undefined) update["team_program"] = patch.teamProgram;
  if (patch.teamNumber !== undefined) update["team_number"] = patch.teamNumber;

  await sb.from("shared_teams").update(update).eq("id", sharedTeamId);

  setState({
    sharedTeams: state.sharedTeams.map((o) =>
      o.sharedTeamId !== sharedTeamId
        ? o
        : {
            ...o,
            name: patch.name !== undefined ? patch.name.trim() : o.name,
            teamProgram: patch.teamProgram !== undefined ? patch.teamProgram : o.teamProgram,
            teamNumber: patch.teamNumber !== undefined ? patch.teamNumber : o.teamNumber,
          },
    ),
  });
}

/** Leave the shared team (remove self from shared_team_members). */
export async function leaveSharedTeam(sharedTeamId: string): Promise<void> {
  const sb = supabase;
  if (!sb || !userId) return;
  await sb.from("shared_team_members").delete().eq("shared_team_id", sharedTeamId).eq("user_id", userId);
  setState({ sharedTeams: state.sharedTeams.filter((o) => o.sharedTeamId !== sharedTeamId) });
}

/** Delete the shared team entirely (owner only). */
export async function deleteSharedTeam(sharedTeamId: string): Promise<void> {
  const sb = supabase;
  if (!sb) return;
  await sb.from("shared_teams").delete().eq("id", sharedTeamId);
  setState({ sharedTeams: state.sharedTeams.filter((o) => o.sharedTeamId !== sharedTeamId) });
}

type SharedTeamInviteRow = {
  id: string;
  shared_team_id: string;
  created_by: string | null;
  used_by: string | null;
  max_uses: number | null;
  use_count: number;
  expires_at: string | null;
  created_at: string;
};

function mapInvite(row: SharedTeamInviteRow): SharedTeamInvite {
  return {
    id: row.id,
    sharedTeamId: row.shared_team_id,
    createdBy: row.created_by,
    usedBy: row.used_by,
    maxUses: row.max_uses,
    useCount: row.use_count,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

/**
 * Generate a new invite link for the shared team.
 * @param maxUses  number of allowed joins, or null for unlimited
 * @param expiresAt ISO timestamp the link expires, or null to never expire
 */
export async function generateInvite(
  sharedTeamId: string,
  { maxUses, expiresAt }: { maxUses: number | null; expiresAt: string | null },
): Promise<SharedTeamInvite> {
  const sb = supabase;
  if (!sb || !userId) throw new Error("Not signed in");
  const { data, error } = await sb
    .from("shared_team_invites")
    .insert({ shared_team_id: sharedTeamId, created_by: userId, max_uses: maxUses, expires_at: expiresAt })
    .select()
    .single();
  if (error || !data) throw error ?? new Error("Failed to generate invite");
  return mapInvite(data as SharedTeamInviteRow);
}

/** Revoke (delete) an invite by its UUID. */
export async function revokeInvite(inviteId: string): Promise<void> {
  const sb = supabase;
  if (!sb) return;
  await sb.from("shared_team_invites").delete().eq("id", inviteId);
}

/** Fetch active (non-expired, non-exhausted) invites for a shared team. */
export async function getSharedTeamInvites(sharedTeamId: string): Promise<SharedTeamInvite[]> {
  const sb = supabase;
  if (!sb) return [];
  const nowIso = new Date().toISOString();
  const { data } = await sb
    .from("shared_team_invites")
    .select("id, shared_team_id, created_by, used_by, max_uses, use_count, expires_at, created_at")
    .eq("shared_team_id", sharedTeamId)
    // Keep links that never expire OR have not yet expired.
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
    .order("created_at", { ascending: false });
  return (data ?? [])
    .map((row) => mapInvite(row as SharedTeamInviteRow))
    // Drop exhausted links (capped invites whose uses are all consumed).
    .filter((invite) => invite.maxUses === null || invite.useCount < invite.maxUses);
}

/** Fetch members of a shared team, joined to their profile info. */
export async function getSharedTeamMembers(sharedTeamId: string): Promise<SharedTeamMember[]> {
  const sb = supabase;
  if (!sb) return [];

  // Two queries instead of a PostgREST join:
  //   • shared_team_members.user_id references auth.users (not profiles), so PostgREST
  //     cannot resolve .select("profiles(...)") automatically.
  //   • profiles RLS is self-only by default; 0004_orgs_fix.sql adds a
  //     supplementary "shared_team peers read profiles" SELECT policy so members can
  //     read each other's display_name + avatar_url.

  // Step 1: get user IDs + roles in join order
  const { data: memberData } = await sb
    .from("shared_team_members")
    .select("user_id, role")
    .eq("shared_team_id", sharedTeamId)
    .order("joined_at", { ascending: true });

  if (!memberData || memberData.length === 0) return [];
  const memberRows = memberData as Array<{ user_id: string; role: string }>;
  const userIds = memberRows.map((r) => r.user_id);

  // Step 2: bulk-fetch profiles for those users
  const { data: profileData } = await sb
    .from("profiles")
    .select("id, display_name, avatar_url")
    .in("id", userIds);

  const profileMap = new Map<string, { display_name: string | null; avatar_url: string | null }>();
  for (const p of (profileData ?? []) as Array<{ id: string; display_name: string | null; avatar_url: string | null }>) {
    profileMap.set(p.id, p);
  }

  return memberRows.map((row) => ({
    userId: row.user_id,
    role: row.role as SharedTeamRole,
    displayName: profileMap.get(row.user_id)?.display_name ?? "Unknown",
    avatarUrl: profileMap.get(row.user_id)?.avatar_url ?? null,
  }));
}

/** Remove a member from a shared team (owner/admin only). */
export async function removeMember(sharedTeamId: string, memberId: string): Promise<void> {
  const sb = supabase;
  if (!sb) return;
  await sb.from("shared_team_members").delete().eq("shared_team_id", sharedTeamId).eq("user_id", memberId);
}

/** Change a member's role (owner only). */
export async function updateMemberRole(sharedTeamId: string, memberId: string, role: SharedTeamRole): Promise<void> {
  const sb = supabase;
  if (!sb) return;
  await sb.from("shared_team_members").update({ role }).eq("shared_team_id", sharedTeamId).eq("user_id", memberId);
}

/** Reload shared teams from cloud (call after joining via invite). */
export async function reloadSharedTeams(): Promise<void> {
  if (userId) await loadCloud(userId);
}

// ── Hooks ────────────────────────────────────────────────────────────────────

export function useSharedTeams(): SharedTeamMembership[] {
  const snapshot = useSyncExternalStore(subscribe, getState, getState);
  return snapshot.sharedTeams;
}

export function useSharedTeam(sharedTeamId: string): SharedTeamMembership | undefined {
  const snapshot = useSyncExternalStore(subscribe, getState, getState);
  return snapshot.sharedTeams.find((o) => o.sharedTeamId === sharedTeamId);
}

export function useSharedTeamsReady(): boolean {
  const snapshot = useSyncExternalStore(subscribe, getState, getState);
  return snapshot.ready;
}
