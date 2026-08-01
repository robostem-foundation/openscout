-- 0015: Require a real identity to create or join a shared team.
-- Run manually in the Supabase SQL editor after 0014. Idempotent & transactional.
--
-- Anonymous sign-in was enabled so the iOS app can obtain a token and browse
-- without forcing an account (decision D1). Supabase gives anonymous users the
-- `authenticated` role, so every policy and grant written for "a signed-in user"
-- silently began applying to them the moment it was switched on.
--
-- For almost everything that is correct and intended: browsing events, teams,
-- matches, and skills should need no account, and the self-owned tables
-- (profiles, user_settings, favorites, match_notes) are keyed on auth.uid(), so
-- an anonymous user reaches nothing but their own empty rows.
--
-- Two paths are not fine:
--
--   1. join_shared_team_by_invite() is granted to `authenticated`, so anyone
--      holding an invite link could join a team and read all of its notes,
--      picklists, and favourites without ever creating an identifiable account.
--      That is a regression against the day before anonymous sign-in existed,
--      when joining at least required a Discord or Google identity — and it
--      compounds with the unlimited, never-expiring invite links that were
--      possible until 0012 and may still be circulating.
--
--   2. Anyone could create a shared team ("shared_team authenticated create"
--      checks only auth.uid() = owner_id). More a spam and bloat vector than a
--      security one, but there is no reason to allow it.
--
-- Both now require a non-anonymous token. Supabase puts `is_anonymous` in the
-- JWT, so the check costs nothing and needs no extra table lookup. Reading it
-- through a helper keeps the coalesce-and-cast in one place: a missing claim
-- must read as "not anonymous", since real accounts predate the claim entirely
-- and must not be locked out.
--
-- Deliberately NOT restricted: reading public data, per-user rows, and
-- peek_invite() — /join/:token renders the team name before sign-in, which is
-- what makes the "sign in to join" prompt intelligible.

begin;

create or replace function private.is_anonymous_user()
returns boolean language sql stable
set search_path = public as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
$$;

revoke execute on function private.is_anonymous_user() from public;
grant execute on function private.is_anonymous_user() to authenticated, anon, service_role;

-- ── 1. Creating a shared team needs a real account ───────────────────────────
drop policy if exists "shared_team authenticated create" on public.shared_teams;
create policy "shared_team authenticated create" on public.shared_teams
  for insert with check (
    auth.uid() = owner_id
    and not private.is_anonymous_user()
  );

-- ── 2. Joining by invite needs a real account ────────────────────────────────
-- The body is 0011's, with one guard added at the top. It is SECURITY DEFINER,
-- so RLS does not apply inside it and the check has to live in the function.
-- The new 'requires_account' error code is handled by the client.
create or replace function private.join_shared_team_by_invite(p_invite_id uuid)
returns jsonb language plpgsql security definer
set search_path = public as $$
declare v_id uuid; v_max int; v_used int; v_count int; v_name text;
begin
  if auth.uid() is null then
    return jsonb_build_object('error','requires_account');
  end if;
  if private.is_anonymous_user() then
    return jsonb_build_object('error','requires_account');
  end if;
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

-- Grants are unchanged from 0011; restated so the function's exposure is
-- readable in one place rather than inferred from an earlier migration.
revoke execute on function private.join_shared_team_by_invite(uuid) from public;
grant execute on function private.join_shared_team_by_invite(uuid)
  to authenticated, service_role;

commit;
