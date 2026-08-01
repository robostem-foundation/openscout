-- 0008: RLS hardening.
-- Run manually in the Supabase SQL editor after 0007. Idempotent & transactional.
--
-- SUPERSEDED IN PART — do not re-run this after 0011. The three functions below
-- moved to the unexposed `private` schema in 0011; recreating them here as
-- SECURITY DEFINER in `public` restores the exposure 0011 removed (advisors
-- 0028/0029) while the policies stay pointed at `private`.
--
-- Two fixes:
--   1. Add WITH CHECK to the two UPDATE policies that only had USING. Without a
--      WITH CHECK, Postgres reuses USING for the post-update row — and neither
--      USING clause constrained the NEW values, so an admin could promote itself
--      to 'owner', and an owner could hand ownership away (owner_id rewrite).
--   2. Pin `set search_path = public` on every SECURITY DEFINER function. Without
--      it, a definer function resolves unqualified names via the caller's
--      search_path (Supabase linter: function_search_path_mutable). handle_new_user
--      (0001) already does this; the three live shared-team functions did not.
--      (0007 already dropped the legacy is_org_member / join_org_by_invite.)
begin;

-- ── Fix 1a: shared_teams owner UPDATE — lock owner_id against silent transfer ─
drop policy if exists "shared_team owner update" on public.shared_teams;
create policy "shared_team owner update" on public.shared_teams
  for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- ── Fix 1b: shared_team_members role UPDATE — block admin→owner escalation ────
-- USING (who may update) is unchanged: any owner/admin of the team. WITH CHECK
-- (what the row may become) is new: only an existing OWNER may set role='owner';
-- admins are capped at 'member'/'admin', so an admin cannot self-promote.
drop policy if exists "shared_team owner admin update role" on public.shared_team_members;
create policy "shared_team owner admin update role" on public.shared_team_members
  for update
  using (
    exists (select 1 from public.shared_team_members m
      where m.shared_team_id = shared_team_members.shared_team_id
        and m.user_id = auth.uid() and m.role in ('owner','admin'))
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

-- ── Fix 2: recreate SECURITY DEFINER functions with a pinned search_path ──────
-- Bodies are byte-for-byte identical to 0007; only `set search_path = public`
-- is added (matching handle_new_user in 0001).

create or replace function public.is_shared_team_member(p_shared_team_id uuid)
returns boolean language sql security definer stable
set search_path = public as $$
  select exists (
    select 1 from public.shared_team_members
    where shared_team_members.shared_team_id = p_shared_team_id
      and shared_team_members.user_id = auth.uid()
  )
$$;

create or replace function public.peek_invite(p_invite_id uuid)
returns jsonb language plpgsql security definer stable
set search_path = public as $$
declare v_id uuid; v_name text; v_count int;
begin
  select shared_team_id into v_id from public.shared_team_invites
  where id = p_invite_id
    and (expires_at is null or expires_at > now())
    and (max_uses is null or use_count < max_uses);
  if not found then return jsonb_build_object('valid', false); end if;
  select name into v_name from public.shared_teams where id = v_id;
  select count(*) into v_count from public.shared_team_members where shared_team_id = v_id;
  return jsonb_build_object('valid', true, 'shared_team_id', v_id,
    'shared_team_name', v_name, 'member_count', v_count);
end; $$;

create or replace function public.join_shared_team_by_invite(p_invite_id uuid)
returns jsonb language plpgsql security definer
set search_path = public as $$
declare v_id uuid; v_max int; v_used int; v_count int; v_name text;
begin
  select shared_team_id, max_uses, use_count into v_id, v_max, v_used
  from public.shared_team_invites
  where id = p_invite_id and (expires_at is null or expires_at > now())
  for update;
  if not found then return jsonb_build_object('error','invite_invalid'); end if;
  if v_max is not null and v_used >= v_max then
    return jsonb_build_object('error','invite_invalid'); end if;
  if exists (select 1 from public.shared_team_members
      where shared_team_id = v_id and user_id = auth.uid()) then
    return jsonb_build_object('ok',true,'already_member',true,'shared_team_id',v_id); end if;
  select count(*) into v_count from public.shared_team_members where shared_team_id = v_id;
  if v_count >= 20 then return jsonb_build_object('error','shared_team_full'); end if;
  insert into public.shared_team_members (shared_team_id, user_id, role)
    values (v_id, auth.uid(), 'member');
  update public.shared_team_invites set use_count = use_count + 1, used_by = auth.uid()
    where id = p_invite_id;
  select name into v_name from public.shared_teams where id = v_id;
  return jsonb_build_object('ok',true,'shared_team_id',v_id,'shared_team_name',v_name);
end; $$;

commit;
