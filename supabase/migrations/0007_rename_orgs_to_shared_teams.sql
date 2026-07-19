-- 0007: Rename Org → Shared Team (in-place, no data loss).
-- Run manually in the Supabase SQL editor (or Management API) in one transaction.
begin;

-- ── 1. Tables ────────────────────────────────────────────────────────────────
alter table public.orgs            rename to shared_teams;
alter table public.org_members     rename to shared_team_members;
alter table public.org_invites     rename to shared_team_invites;
alter table public.org_favorites   rename to shared_team_favorites;
alter table public.org_match_notes rename to shared_team_match_notes;
alter table public.org_picklists   rename to shared_team_picklists;

-- ── 2. Columns (org_id → shared_team_id on every child table) ────────────────
alter table public.shared_team_members     rename column org_id to shared_team_id;
alter table public.shared_team_invites     rename column org_id to shared_team_id;
alter table public.shared_team_favorites   rename column org_id to shared_team_id;
alter table public.shared_team_match_notes rename column org_id to shared_team_id;
alter table public.shared_team_picklists   rename column org_id to shared_team_id;

-- ── 3. Index rename (from 0004) ──────────────────────────────────────────────
alter index if exists org_members_user_id_idx rename to shared_team_members_user_id_idx;

-- ── 4. Helper fn: is_shared_team_member ──────────────────────────────────────
create or replace function public.is_shared_team_member(p_shared_team_id uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.shared_team_members
    where shared_team_members.shared_team_id = p_shared_team_id
      and shared_team_members.user_id = auth.uid()
  )
$$;

-- ── 5. Drop old policies (names referenced old fn/tables) ─────────────────────
drop policy if exists "org members read"            on public.shared_teams;
drop policy if exists "authenticated create org"    on public.shared_teams;
drop policy if exists "org owner update"            on public.shared_teams;
drop policy if exists "org owner delete"            on public.shared_teams;
drop policy if exists "org members read members"    on public.shared_team_members;
drop policy if exists "org member self delete"      on public.shared_team_members;
drop policy if exists "org owner admin update role" on public.shared_team_members;
drop policy if exists "org owner initial member"    on public.shared_team_members;
drop policy if exists "org members manage invites"  on public.shared_team_invites;
drop policy if exists "org members manage favorites" on public.shared_team_favorites;
drop policy if exists "org members manage notes"    on public.shared_team_match_notes;
drop policy if exists "org members manage picklist" on public.shared_team_picklists;
drop policy if exists "org peers read profiles"     on public.profiles;

-- ── 6. Recreate policies against renamed tables/columns/fn ────────────────────
create policy "shared_team members read" on public.shared_teams
  for select using (public.is_shared_team_member(id) or owner_id = auth.uid());
create policy "shared_team authenticated create" on public.shared_teams
  for insert with check (auth.uid() = owner_id);
create policy "shared_team owner update" on public.shared_teams
  for update using (owner_id = auth.uid());
create policy "shared_team owner delete" on public.shared_teams
  for delete using (owner_id = auth.uid());

create policy "shared_team members read members" on public.shared_team_members
  for select using (public.is_shared_team_member(shared_team_id));
create policy "shared_team member self delete" on public.shared_team_members
  for delete using (
    user_id = auth.uid()
    or exists (select 1 from public.shared_team_members m
      where m.shared_team_id = shared_team_members.shared_team_id
        and m.user_id = auth.uid() and m.role in ('owner','admin'))
  );
create policy "shared_team owner admin update role" on public.shared_team_members
  for update using (
    exists (select 1 from public.shared_team_members m
      where m.shared_team_id = shared_team_members.shared_team_id
        and m.user_id = auth.uid() and m.role in ('owner','admin'))
  );
create policy "shared_team owner initial member" on public.shared_team_members
  for insert with check (
    user_id = auth.uid()
    and exists (select 1 from public.shared_teams
      where id = shared_team_members.shared_team_id and owner_id = auth.uid())
  );

create policy "shared_team members manage invites" on public.shared_team_invites
  for all using (public.is_shared_team_member(shared_team_id))
  with check (public.is_shared_team_member(shared_team_id));
create policy "shared_team members manage favorites" on public.shared_team_favorites
  for all using (public.is_shared_team_member(shared_team_id))
  with check (public.is_shared_team_member(shared_team_id));
create policy "shared_team members manage notes" on public.shared_team_match_notes
  for all using (public.is_shared_team_member(shared_team_id))
  with check (public.is_shared_team_member(shared_team_id));
create policy "shared_team members manage picklist" on public.shared_team_picklists
  for all using (public.is_shared_team_member(shared_team_id))
  with check (public.is_shared_team_member(shared_team_id));

create policy "shared_team peers read profiles" on public.profiles
  for select using (
    exists (select 1 from public.shared_team_members m1
      join public.shared_team_members m2 on m1.shared_team_id = m2.shared_team_id
      where m1.user_id = auth.uid() and m2.user_id = profiles.id)
  );

-- ── 7. RPCs: peek_invite (kept name) + join_shared_team_by_invite ────────────
create or replace function public.peek_invite(p_invite_id uuid)
returns jsonb language plpgsql security definer stable as $$
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
returns jsonb language plpgsql security definer as $$
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

drop function if exists public.join_org_by_invite(uuid);
drop function if exists public.is_org_member(uuid);

commit;
