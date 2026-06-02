import { useSyncExternalStore } from "react";
import { supabase } from "./supabase";

// Org membership store — cloud-only (no localStorage fallback).
// When signed out: orgs=[], ready=true.
// When signed in: fetches the user's org memberships once and caches in module state.
// Mirrors the useSyncExternalStore pattern from favorites.ts / notes.ts.

export type OrgRole = "owner" | "admin" | "member";

export type OrgMembership = {
  orgId: string;
  name: string;
  role: OrgRole;
  teamProgram: string | null;
  teamNumber: string | null;
};

export type OrgInvite = {
  id: string;
  orgId: string;
  createdBy: string | null;
  usedBy: string | null;
  expiresAt: string;
  createdAt: string;
};

export type OrgMember = {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  role: OrgRole;
};

type State = {
  orgs: OrgMembership[];
  ready: boolean;
  signedIn: boolean;
};

let state: State = { orgs: [], ready: false, signedIn: false };

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

  // Fetch memberships with org details in one round-trip
  const { data } = await sb
    .from("org_members")
    .select("role, orgs(id, name, team_program, team_number)")
    .eq("user_id", uid);

  const orgs: OrgMembership[] = [];
  type MemberRow = {
    role: string;
    orgs: { id: string; name: string; team_program: string | null; team_number: string | null } | null;
  };
  for (const row of (data ?? []) as unknown as MemberRow[]) {
    if (!row.orgs) continue;
    orgs.push({
      orgId: row.orgs.id,
      name: row.orgs.name,
      role: row.role as OrgRole,
      teamProgram: row.orgs.team_program,
      teamNumber: row.orgs.team_number,
    });
  }

  setState({ orgs, ready: true, signedIn: true });
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
    setState({ orgs: [], ready: true, signedIn: false });
  }
}

(function init() {
  const sb = supabase;
  if (!sb) {
    setState({ orgs: [], ready: true, signedIn: false });
    return;
  }
  void sb.auth.getSession().then(({ data }) => applyAuth(data.session?.user?.id ?? null));
  sb.auth.onAuthStateChange((_event, session) => applyAuth(session?.user?.id ?? null));
})();

// ── Exported actions ─────────────────────────────────────────────────────────

/** Create an org. Returns the new org's UUID. */
export async function createOrg(
  name: string,
  teamProgram?: string | null,
  teamNumber?: string | null,
): Promise<string> {
  const sb = supabase;
  if (!sb || !userId) throw new Error("Not signed in");

  // Insert org (owner_id set to current user)
  const { data: orgData, error: orgError } = await sb
    .from("orgs")
    .insert({ name: name.trim(), owner_id: userId, team_program: teamProgram ?? null, team_number: teamNumber ?? null })
    .select("id")
    .single();

  if (orgError || !orgData) throw orgError ?? new Error("Failed to create org");
  const orgId = orgData.id as string;

  // Add owner as member
  await sb.from("org_members").insert({ org_id: orgId, user_id: userId, role: "owner" });

  // Optimistic update
  setState({
    orgs: [
      ...state.orgs,
      { orgId, name: name.trim(), role: "owner", teamProgram: teamProgram ?? null, teamNumber: teamNumber ?? null },
    ],
  });

  return orgId;
}

/** Update org name / team info. */
export async function updateOrg(
  orgId: string,
  patch: { name?: string; teamProgram?: string | null; teamNumber?: string | null },
): Promise<void> {
  const sb = supabase;
  if (!sb) return;

  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update["name"] = patch.name.trim();
  if (patch.teamProgram !== undefined) update["team_program"] = patch.teamProgram;
  if (patch.teamNumber !== undefined) update["team_number"] = patch.teamNumber;

  await sb.from("orgs").update(update).eq("id", orgId);

  setState({
    orgs: state.orgs.map((o) =>
      o.orgId !== orgId
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

/** Leave the org (remove self from org_members). */
export async function leaveOrg(orgId: string): Promise<void> {
  const sb = supabase;
  if (!sb || !userId) return;
  await sb.from("org_members").delete().eq("org_id", orgId).eq("user_id", userId);
  setState({ orgs: state.orgs.filter((o) => o.orgId !== orgId) });
}

/** Delete the org entirely (owner only). */
export async function deleteOrg(orgId: string): Promise<void> {
  const sb = supabase;
  if (!sb) return;
  await sb.from("orgs").delete().eq("id", orgId);
  setState({ orgs: state.orgs.filter((o) => o.orgId !== orgId) });
}

/** Generate a new invite link for the org. */
export async function generateInvite(orgId: string): Promise<OrgInvite> {
  const sb = supabase;
  if (!sb || !userId) throw new Error("Not signed in");
  const { data, error } = await sb
    .from("org_invites")
    .insert({ org_id: orgId, created_by: userId })
    .select()
    .single();
  if (error || !data) throw error ?? new Error("Failed to generate invite");
  const row = data as { id: string; org_id: string; created_by: string | null; used_by: string | null; expires_at: string; created_at: string };
  return {
    id: row.id,
    orgId: row.org_id,
    createdBy: row.created_by,
    usedBy: row.used_by,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

/** Revoke (delete) an invite by its UUID. */
export async function revokeInvite(inviteId: string): Promise<void> {
  const sb = supabase;
  if (!sb) return;
  await sb.from("org_invites").delete().eq("id", inviteId);
}

/** Fetch active (non-expired, unused) invites for an org. */
export async function getOrgInvites(orgId: string): Promise<OrgInvite[]> {
  const sb = supabase;
  if (!sb) return [];
  const { data } = await sb
    .from("org_invites")
    .select("id, org_id, created_by, used_by, expires_at, created_at")
    .eq("org_id", orgId)
    .is("used_by", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  return (data ?? []).map((row: { id: string; org_id: string; created_by: string | null; used_by: string | null; expires_at: string; created_at: string }) => ({
    id: row.id,
    orgId: row.org_id,
    createdBy: row.created_by,
    usedBy: row.used_by,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  }));
}

/** Fetch members of an org, joined to their profile info. */
export async function getOrgMembers(orgId: string): Promise<OrgMember[]> {
  const sb = supabase;
  if (!sb) return [];

  // Two queries instead of a PostgREST join:
  //   • org_members.user_id references auth.users (not profiles), so PostgREST
  //     cannot resolve .select("profiles(...)") automatically.
  //   • profiles RLS is self-only by default; 0004_orgs_fix.sql adds a
  //     supplementary "org peers read profiles" SELECT policy so members can
  //     read each other's display_name + avatar_url.

  // Step 1: get user IDs + roles in join order
  const { data: memberData } = await sb
    .from("org_members")
    .select("user_id, role")
    .eq("org_id", orgId)
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
    role: row.role as OrgRole,
    displayName: profileMap.get(row.user_id)?.display_name ?? "Unknown",
    avatarUrl: profileMap.get(row.user_id)?.avatar_url ?? null,
  }));
}

/** Remove a member from an org (owner/admin only). */
export async function removeMember(orgId: string, memberId: string): Promise<void> {
  const sb = supabase;
  if (!sb) return;
  await sb.from("org_members").delete().eq("org_id", orgId).eq("user_id", memberId);
}

/** Change a member's role (owner only). */
export async function updateMemberRole(orgId: string, memberId: string, role: OrgRole): Promise<void> {
  const sb = supabase;
  if (!sb) return;
  await sb.from("org_members").update({ role }).eq("org_id", orgId).eq("user_id", memberId);
}

/** Reload orgs from cloud (call after joining via invite). */
export async function reloadOrgs(): Promise<void> {
  if (userId) await loadCloud(userId);
}

// ── Hooks ────────────────────────────────────────────────────────────────────

export function useOrgs(): OrgMembership[] {
  const snapshot = useSyncExternalStore(subscribe, getState, getState);
  return snapshot.orgs;
}

export function useOrg(orgId: string): OrgMembership | undefined {
  const snapshot = useSyncExternalStore(subscribe, getState, getState);
  return snapshot.orgs.find((o) => o.orgId === orgId);
}

export function useOrgsReady(): boolean {
  const snapshot = useSyncExternalStore(subscribe, getState, getState);
  return snapshot.ready;
}
