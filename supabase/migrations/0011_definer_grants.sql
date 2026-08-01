-- 0011: Lock down EXECUTE on the SECURITY DEFINER functions.
-- Run manually in the Supabase SQL editor after 0010. Idempotent & transactional.
--
-- Background — Supabase advisors 0028 (anon_security_definer_function_executable)
-- and 0029 (authenticated_security_definer_function_executable) flag every
-- SECURITY DEFINER function that lives in an exposed schema (public) and is
-- EXECUTE-able by anon / authenticated. Postgres grants EXECUTE to PUBLIC on
-- every new function, and anon/authenticated inherit PUBLIC, so all four of our
-- definer functions were reachable at /rest/v1/rpc/<name>. Fixes, per function:
--
--   handle_new_user()             Trigger-only; nothing should ever call it as an
--                                 RPC. Revoke EXECUTE from PUBLIC and hand it to
--                                 supabase_auth_admin (the role that inserts into
--                                 auth.users) so the signup trigger is unaffected.
--   is_shared_team_member(uuid)   Called only from RLS policy expressions, never
--                                 by the client. It cannot simply be revoked —
--                                 policy expressions run as the caller, so
--                                 authenticated needs EXECUTE or every shared-team
--                                 read errors out. Moved to the unexposed `private`
--                                 schema instead (no REST endpoint), with the six
--                                 policies repointed at it.
--   peek_invite(uuid)             Genuinely public: /join/:token renders the team
--   join_shared_team_by_invite()   name before sign-in, and the join button is
--                                 gated on a signed-in user. The definer bodies
--                                 move to `private`; `public.<name>` stays as a
--                                 thin SECURITY INVOKER wrapper so the REST
--                                 endpoint keeps working byte-for-byte. Grants are
--                                 narrowed from PUBLIC to exactly the roles that
--                                 need them (peek: anon + authenticated; join:
--                                 authenticated only — anon could never succeed
--                                 anyway, auth.uid() is null and the member insert
--                                 would fail the NOT NULL on the user_id PK column).
--                                 Be honest about what this buys: for these two the
--                                 advisor goes green because the *public* function is
--                                 now INVOKER, but the REST path and the code an
--                                 attacker can reach are byte-identical. Real
--                                 hardening is the narrowed grants, not the move.
--                                 handle_new_user and is_shared_team_member are the
--                                 two that genuinely become unreachable.
--
-- Function bodies below are byte-for-byte identical to 0008; only their schema,
-- security label, and grants change. No data is touched.
--
-- PRE-FLIGHT: step 2 drops public.is_shared_team_member, and RLS policies do
-- record a pg_depend edge on functions used in USING / WITH CHECK, so a policy
-- added outside these migrations (e.g. via the dashboard) would abort the whole
-- transaction with 2BP01. Confirm the only dependents are the six policies this
-- file repoints:
--   select distinct pg_describe_object(d.classid, d.objid, d.objsubid)
--   from pg_depend d
--   where d.refobjid = 'public.is_shared_team_member(uuid)'::regprocedure;
--
-- DO NOT re-run 0007 or 0008 after this migration — both recreate these
-- functions as SECURITY DEFINER in public and undo everything below.
--
-- APPLIED to project sjwalryubulbbbhuerbe (OpenScout) on 2026-07-31 via
-- `supabase db query --linked -f`. Verified after: all six policies repointed,
-- anon/authenticated EXECUTE gone from handle_new_user, is_shared_team_member no
-- longer resolvable over REST, join_ RPC 401s for anon, peek_invite still 200s for
-- anon, signed-out table reads still return [] (not 42501), and a rolled-back
-- end-to-end invite peek→join→rejoin returned the exact JSON the client expects.
-- `supabase db advisors --linked --type security` now reports zero 0028/0029 rows.
begin;

-- ── 0. The private (unexposed) schema ────────────────────────────────────────
-- PostgREST only exposes the schemas in its db-schemas config (public,
-- graphql_public), so nothing in here is reachable over the Data API.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

-- ⚠ MAINTENANCE RULE — every function added to this schema MUST be followed by
--   revoke execute on function private.<name>(<args>) from public;
--   grant  execute on function private.<name>(<args>) to <only the roles needed>;
-- Postgres grants EXECUTE to PUBLIC on every new function and anon/authenticated
-- hold USAGE here, so a new function is open by default — and because advisors
-- 0026-0029 only inspect PostgREST-exposed schemas, nothing in `private` is ever
-- linted. A forgotten revoke here is silent.
--
-- `alter default privileges in schema private revoke execute on functions from
-- public` does NOT work as a blanket guard on Supabase — verified empirically on
-- this project (PG 17.6): the statement succeeds but writes no pg_default_acl row,
-- and a freshly created function still comes out with `=X/postgres` (PUBLIC
-- EXECUTE). The GRANT form of the same statement does persist, so this is
-- specific to revoking the built-in PUBLIC default. Hence the per-function
-- revokes below, which are verified to work.

-- ── 1. handle_new_user: trigger-only ────────────────────────────────────────
-- CREATE TRIGGER checks EXECUTE at creation time, not on every fire, so this is
-- safe for the existing on_auth_user_created trigger. The explicit grant to
-- supabase_auth_admin makes it safe either way.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant execute on function public.handle_new_user() to supabase_auth_admin;
  end if;
end $$;
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon, authenticated;

-- ── 2. is_shared_team_member → private ──────────────────────────────────────
create or replace function private.is_shared_team_member(p_shared_team_id uuid)
returns boolean language sql security definer stable
set search_path = public as $$
  select exists (
    select 1 from public.shared_team_members
    where shared_team_members.shared_team_id = p_shared_team_id
      and shared_team_members.user_id = auth.uid()
  )
$$;
revoke execute on function private.is_shared_team_member(uuid) from public;
-- anon is granted too: the policies below carry no TO clause, so an anonymous
-- request against these tables still evaluates the expression. It returns false
-- (auth.uid() is null) exactly as it does today — without the grant it would
-- raise a permission error instead of returning zero rows.
grant execute on function private.is_shared_team_member(uuid)
  to anon, authenticated, service_role;

-- Repoint the six policies that call it. Predicates are unchanged apart from the
-- schema qualifier. (The two policies 0008 rewrote don't reference the function.)
drop policy if exists "shared_team members read" on public.shared_teams;
create policy "shared_team members read" on public.shared_teams
  for select using (private.is_shared_team_member(id) or owner_id = auth.uid());

drop policy if exists "shared_team members read members" on public.shared_team_members;
create policy "shared_team members read members" on public.shared_team_members
  for select using (private.is_shared_team_member(shared_team_id));

drop policy if exists "shared_team members manage invites" on public.shared_team_invites;
create policy "shared_team members manage invites" on public.shared_team_invites
  for all using (private.is_shared_team_member(shared_team_id))
  with check (private.is_shared_team_member(shared_team_id));

drop policy if exists "shared_team members manage favorites" on public.shared_team_favorites;
create policy "shared_team members manage favorites" on public.shared_team_favorites
  for all using (private.is_shared_team_member(shared_team_id))
  with check (private.is_shared_team_member(shared_team_id));

drop policy if exists "shared_team members manage notes" on public.shared_team_match_notes;
create policy "shared_team members manage notes" on public.shared_team_match_notes
  for all using (private.is_shared_team_member(shared_team_id))
  with check (private.is_shared_team_member(shared_team_id));

drop policy if exists "shared_team members manage picklist" on public.shared_team_picklists;
create policy "shared_team members manage picklist" on public.shared_team_picklists
  for all using (private.is_shared_team_member(shared_team_id))
  with check (private.is_shared_team_member(shared_team_id));

-- Now that nothing depends on it, retire the public copy.
drop function if exists public.is_shared_team_member(uuid);

-- ── 3. peek_invite: definer body private, invoker wrapper public ─────────────
create or replace function private.peek_invite(p_invite_id uuid)
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
revoke execute on function private.peek_invite(uuid) from public;
grant execute on function private.peek_invite(uuid) to anon, authenticated, service_role;

create or replace function public.peek_invite(p_invite_id uuid)
returns jsonb language sql security invoker stable
set search_path = public as $$
  select private.peek_invite(p_invite_id)
$$;
revoke execute on function public.peek_invite(uuid) from public;
grant execute on function public.peek_invite(uuid) to anon, authenticated, service_role;

-- ── 4. join_shared_team_by_invite: same shape, authenticated only ────────────
create or replace function private.join_shared_team_by_invite(p_invite_id uuid)
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
revoke execute on function private.join_shared_team_by_invite(uuid) from public;
grant execute on function private.join_shared_team_by_invite(uuid)
  to authenticated, service_role;

create or replace function public.join_shared_team_by_invite(p_invite_id uuid)
returns jsonb language sql security invoker
set search_path = public as $$
  select private.join_shared_team_by_invite(p_invite_id)
$$;
revoke execute on function public.join_shared_team_by_invite(uuid) from public;
grant execute on function public.join_shared_team_by_invite(uuid)
  to authenticated, service_role;

commit;

-- ── Not covered here: auth_leaked_password_protection ────────────────────────
-- That advisor is a project-level Auth setting, not schema, so it cannot be
-- fixed from SQL. It is also inert for us today: sign-in is OAuth-only (Discord
-- + Google, see src/auth.tsx and src/google-signin.ts), so no password ever
-- reaches Supabase Auth. Enable it anyway as future-proofing:
--   Dashboard → Authentication → Sign In / Providers → Password →
--   "Prevent use of leaked passwords" → Save.
