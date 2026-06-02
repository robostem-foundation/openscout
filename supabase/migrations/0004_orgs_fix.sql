-- Phase E bug fixes
-- Run in the Supabase SQL editor after 0003_orgs.sql.

-- ── Fix 1: Allow org creators to insert themselves as the initial member ──────
-- createOrg() does a direct INSERT into org_members (role='owner') after
-- creating the orgs row, but 0003 had no INSERT policy on org_members
-- (the comment "join handled by RPC" referred to invite-based joins only).
-- This policy allows a user to add themselves to org_members only when they
-- are the owner of that org — preventing arbitrary self-join to other orgs.

drop policy if exists "org owner initial member" on public.org_members;
create policy "org owner initial member" on public.org_members
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.orgs
      where id = org_members.org_id
        and owner_id = auth.uid()
    )
  );

-- ── Fix 2: Allow org members to read each other's profiles ───────────────────
-- The original "profiles are self-owned" policy only lets users read their own
-- profile row. The org settings Members tab needs to display display_name and
-- avatar_url for all members of the org. This adds a supplementary SELECT-only
-- policy that allows reading another user's profile if you share an org.
-- INSERT/UPDATE/DELETE on profiles remain self-only (the original policy still
-- applies for those operations via PostgreSQL's permissive policy OR logic).

drop policy if exists "org peers read profiles" on public.profiles;
create policy "org peers read profiles" on public.profiles
  for select using (
    exists (
      select 1
      from public.org_members m1
      join public.org_members m2 on m1.org_id = m2.org_id
      where m1.user_id = auth.uid()
        and m2.user_id = profiles.id
    )
  );

-- ── Fix 3: Index on org_members(user_id) for loadCloud + policy subqueries ───
-- The PK is (org_id, user_id) which doesn't help user_id-only lookups.
-- This index speeds up: loadCloud (.eq("user_id", uid)), org peers policy
-- subquery (m1.user_id = auth.uid()), and is_org_member for other callers.

create index if not exists org_members_user_id_idx
  on public.org_members(user_id);
