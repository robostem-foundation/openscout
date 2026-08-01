-- 0014: Account deletion — request, 14-day restore window, then permanent purge.
-- Run manually in the Supabase SQL editor after 0013. Idempotent & transactional.
--
-- Required by App Store Review Guideline 5.1.1(v): an app that supports account
-- creation must let the user initiate deletion in-app. Today there is no deletion
-- path anywhere — Terms §3 and Privacy §9 both say "contact us" — so this is a
-- submission blocker, not a nicety.
--
-- It could not be built as "just an RPC" either. Six columns reference
-- `auth.users` with no ON DELETE behaviour, so `delete from auth.users` fails
-- outright with a foreign-key violation:
--
--   shared_teams.owner_id             (NOT NULL — the blocking one)
--   shared_team_invites.created_by
--   shared_team_invites.used_by
--   shared_team_favorites.added_by
--   shared_team_notes.last_edited_by
--   shared_team_picklists.added_by
--
-- Attribution columns become ON DELETE SET NULL rather than CASCADE: deleting
-- your account must not delete a team's shared notes, favourites, or picklist.
-- The rows survive, unattributed. `owner_id` is handled by explicit ownership
-- transfer in the purge function (see below), with CASCADE only as a backstop so
-- a manual delete from the Supabase dashboard cannot wedge on the constraint.
--
-- Model, per product decision (docs/mobile-app-spec/99-DECISIONS.md D2 / R1–R2):
--   * The user requests deletion; `profiles.deletion_requested_at` is stamped.
--   * The account is treated as disabled by the client from that moment.
--   * Signing in surfaces a restore prompt, and restoring clears the stamp.
--     Sign-in alone does not silently cancel a deliberate deletion.
--   * After 14 days the purge is permanent.
--
-- Sole-owner rule for shared teams (R1, decided here): a team with other members
-- transfers to its longest-tenured admin, else its longest-tenured member. A team
-- whose only member is the departing owner is deleted with the account. This never
-- traps the user in an undeletable account and never destroys other people's work.

begin;

-- ── 1. Repair the foreign keys that block deletion ───────────────────────────
-- Constraint names vary by environment (0003 vs. the 0007 fresh-create path), so
-- each is located by table + column rather than assumed.

create or replace function private.repoint_user_fk(
  p_table text, p_column text, p_action text
) returns void language plpgsql
set search_path = public as $$
declare v_name text;
begin
  if to_regclass('public.' || p_table) is null then return; end if;

  select con.conname into v_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = p_table
    and con.contype = 'f'
    and con.conkey = array[(
      select attnum from pg_attribute
      where attrelid = rel.oid and attname = p_column and not attisdropped
    )::smallint]
  limit 1;

  if v_name is not null then
    execute format('alter table public.%I drop constraint %I', p_table, v_name);
  end if;

  execute format(
    'alter table public.%I add constraint %I foreign key (%I) references auth.users(id) on delete %s',
    p_table, p_table || '_' || p_column || '_fkey', p_column, p_action
  );
end; $$;

select private.repoint_user_fk('shared_team_invites',   'created_by',     'set null');
select private.repoint_user_fk('shared_team_invites',   'used_by',        'set null');
select private.repoint_user_fk('shared_team_favorites', 'added_by',       'set null');
select private.repoint_user_fk('shared_team_notes',     'last_edited_by', 'set null');
select private.repoint_user_fk('shared_team_picklists', 'added_by',       'set null');
-- owner_id is NOT NULL, so SET NULL is not available. The purge function
-- transfers or deletes owned teams first; CASCADE is the backstop only.
select private.repoint_user_fk('shared_teams',          'owner_id',       'cascade');

drop function if exists private.repoint_user_fk(text, text, text);

-- ── 2. Deletion request state ────────────────────────────────────────────────
alter table public.profiles
  add column if not exists deletion_requested_at timestamptz;

create index if not exists profiles_deletion_requested_idx
  on public.profiles (deletion_requested_at)
  where deletion_requested_at is not null;

-- ── 3. Ownership hand-off ────────────────────────────────────────────────────
/**
 * Release every shared team owned by p_user: transfer to the longest-tenured
 * admin, else the longest-tenured remaining member, else delete the team when
 * p_user is its only member. Returns the number of teams deleted.
 */
create or replace function private.release_owned_shared_teams(p_user uuid)
returns integer language plpgsql security definer
set search_path = public as $$
declare
  v_team record;
  v_heir uuid;
  v_deleted integer := 0;
begin
  for v_team in
    select id from public.shared_teams where owner_id = p_user
  loop
    select m.user_id into v_heir
    from public.shared_team_members m
    where m.shared_team_id = v_team.id
      and m.user_id <> p_user
    order by (m.role = 'admin') desc, m.created_at asc
    limit 1;

    if v_heir is null then
      -- Sole member: the team has no reason to outlive the account.
      delete from public.shared_teams where id = v_team.id;
      v_deleted := v_deleted + 1;
    else
      update public.shared_teams set owner_id = v_heir where id = v_team.id;
      update public.shared_team_members set role = 'owner'
        where shared_team_id = v_team.id and user_id = v_heir;
      delete from public.shared_team_members
        where shared_team_id = v_team.id and user_id = p_user;
    end if;
  end loop;

  return v_deleted;
end; $$;

revoke execute on function private.release_owned_shared_teams(uuid) from public;

-- ── 4. Client-callable request / cancel ──────────────────────────────────────
/**
 * Mark the calling user's account for deletion. Idempotent — calling twice does
 * not extend the window. Returns the timestamp at which the purge becomes due.
 */
create or replace function public.request_account_deletion()
returns timestamptz language plpgsql security definer
set search_path = public as $$
declare v_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  update public.profiles
    set deletion_requested_at = coalesce(deletion_requested_at, now())
    where id = auth.uid()
    returning deletion_requested_at into v_at;

  if v_at is null then
    raise exception 'profile not found';
  end if;

  return v_at + interval '14 days';
end; $$;

revoke execute on function public.request_account_deletion() from public;
grant execute on function public.request_account_deletion() to authenticated;

/**
 * Cancel a pending deletion for the calling user. Returns true when a pending
 * request was actually cleared, so the client can distinguish "restored" from
 * "there was nothing to restore".
 */
create or replace function public.cancel_account_deletion()
returns boolean language plpgsql security definer
set search_path = public as $$
declare v_count integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  update public.profiles set deletion_requested_at = null
    where id = auth.uid() and deletion_requested_at is not null;
  get diagnostics v_count = row_count;
  return v_count > 0;
end; $$;

revoke execute on function public.cancel_account_deletion() from public;
grant execute on function public.cancel_account_deletion() to authenticated;

-- ── 5. The purge ─────────────────────────────────────────────────────────────
/**
 * Permanently delete every account whose restore window has closed. Not called
 * automatically — schedule it (pg_cron, or a server-side job) once per day.
 *
 * Deleting the auth.users row is what removes the user's own data: profiles,
 * user_settings, match_notes and shared_team_members all cascade from it
 * (0001, 0002, 0003). Shared-team content is deliberately preserved and merely
 * unattributed, per the SET NULL repairs above.
 */
create or replace function private.purge_expired_accounts(p_window interval default interval '14 days')
returns integer language plpgsql security definer
set search_path = public as $$
declare
  v_user uuid;
  v_purged integer := 0;
begin
  for v_user in
    select id from public.profiles
    where deletion_requested_at is not null
      and deletion_requested_at < now() - p_window
  loop
    perform private.release_owned_shared_teams(v_user);
    delete from auth.users where id = v_user;
    v_purged := v_purged + 1;
  end loop;

  return v_purged;
end; $$;

revoke execute on function private.purge_expired_accounts(interval) from public;

commit;
