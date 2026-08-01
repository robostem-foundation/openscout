-- 0012: Shared-team role hardening — invite management and owner protection.
-- Run manually in the Supabase SQL editor after 0011. Idempotent & transactional.
--
-- Two independent privilege problems, both found while specifying the iOS app.
--
--   1. Invite minting was a pure membership test. `0011`'s policy
--      "shared_team members manage invites" is FOR ALL using/with check
--      is_shared_team_member(shared_team_id) — no role component. So any plain
--      member could mint invite links, and because `0006` made NULL expiry and
--      NULL max_uses both legal, those links could be unlimited and permanent.
--      Worse, FOR ALL also covers UPDATE and DELETE, so any member could revoke
--      another member's invites or reset `use_count` to re-open an exhausted
--      link — which is why a use cap was not actually enforceable against a
--      member acting alone.
--
--      Fix: split the single FOR ALL policy into SELECT (any member, so the
--      invites list still renders) and INSERT/UPDATE/DELETE (owner/admin only).
--
--   2. An admin could evict or demote the owner. `0008`'s WITH CHECK on
--      "shared_team owner admin update role" guards escalation *upward* (only an
--      owner may set role='owner') but says nothing about acting *on* the owner,
--      and "shared_team member self delete" lets any owner/admin delete any row.
--      So an admin could demote the owner to 'member' and take the team.
--
--      Fix: both policies now refuse to target a row whose role is 'owner'
--      unless the caller is that same user (so an owner can still remove
--      themselves; team deletion remains the owner-only path in 0007).
--
-- Not changed here: the UI still offers "unlimited uses" and "never expires" to
-- owners/admins. That is now a deliberate owner-level choice rather than
-- something any member can do, and capping it is a product decision, not a
-- security fix. See docs/mobile-app-spec/99-DECISIONS.md D10.

begin;

-- ── Fix 1: invites — read for members, write for owner/admin ─────────────────
drop policy if exists "shared_team members manage invites" on public.shared_team_invites;

create policy "shared_team members read invites" on public.shared_team_invites
  for select using (private.is_shared_team_member(shared_team_id));

create policy "shared_team admins create invites" on public.shared_team_invites
  for insert
  with check (
    exists (select 1 from public.shared_team_members m
      where m.shared_team_id = shared_team_invites.shared_team_id
        and m.user_id = auth.uid() and m.role in ('owner','admin'))
  );

create policy "shared_team admins update invites" on public.shared_team_invites
  for update
  using (
    exists (select 1 from public.shared_team_members m
      where m.shared_team_id = shared_team_invites.shared_team_id
        and m.user_id = auth.uid() and m.role in ('owner','admin'))
  )
  with check (
    exists (select 1 from public.shared_team_members m
      where m.shared_team_id = shared_team_invites.shared_team_id
        and m.user_id = auth.uid() and m.role in ('owner','admin'))
  );

create policy "shared_team admins delete invites" on public.shared_team_invites
  for delete
  using (
    exists (select 1 from public.shared_team_members m
      where m.shared_team_id = shared_team_invites.shared_team_id
        and m.user_id = auth.uid() and m.role in ('owner','admin'))
  );

-- NOTE: `use_count` is incremented by private.join_shared_team_by_invite(), a
-- SECURITY DEFINER function, so redemption is unaffected by the UPDATE policy
-- above — a joiner is not a member yet and could never have satisfied it.

-- ── Fix 2a: nobody but the owner may delete the owner's membership row ───────
drop policy if exists "shared_team member self delete" on public.shared_team_members;
create policy "shared_team member self delete" on public.shared_team_members
  for delete using (
    (
      user_id = auth.uid()
      or exists (select 1 from public.shared_team_members m
        where m.shared_team_id = shared_team_members.shared_team_id
          and m.user_id = auth.uid() and m.role in ('owner','admin'))
    )
    -- An owner row is removable only by that owner. Blocks admin eviction.
    and (role <> 'owner' or user_id = auth.uid())
  );

-- ── Fix 2b: nobody but the owner may change the owner's role ────────────────
-- WITH CHECK is carried over from 0008 unchanged (it blocks admin→owner
-- self-promotion). USING gains the owner-row guard.
drop policy if exists "shared_team owner admin update role" on public.shared_team_members;
create policy "shared_team owner admin update role" on public.shared_team_members
  for update
  using (
    exists (select 1 from public.shared_team_members m
      where m.shared_team_id = shared_team_members.shared_team_id
        and m.user_id = auth.uid() and m.role in ('owner','admin'))
    and (role <> 'owner' or user_id = auth.uid())
  )
  with check (
    case
      when role = 'owner' then
        exists (select 1 from public.shared_team_members m
          where m.shared_team_id = shared_team_members.shared_team_id
            and m.user_id = auth.uid() and m.role = 'owner')
      else
        exists (select 1 from public.shared_team_members m
          where m.shared_team_id = shared_team_members.shared_team_id
            and m.user_id = auth.uid() and m.role in ('owner','admin'))
    end
  );

commit;
