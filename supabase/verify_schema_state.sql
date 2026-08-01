-- Read-only: report which migrations are actually applied to this database.
--
-- Nothing here writes, locks, or creates anything. Paste the whole file into the
-- Supabase SQL editor and read the result table.
--
-- Why this exists: the remote has no rows in supabase_migrations.schema_migrations
-- (every migration was hand-run in the SQL editor), so `supabase migration list`
-- shows an empty Remote column and the CLI cannot tell applied from unapplied.
-- `supabase db push` in that state would replay 0001 onward — and re-running 0007
-- reverts 0008's WITH CHECK hardening, while re-running 0008 restores the
-- public-schema SECURITY DEFINER exposure that 0011 removed.
--
-- Each row checks for an object that migration creates and nothing else does.
-- Read the `status` column:
--
--   APPLIED       the object exists
--   NOT APPLIED   it does not
--   PARTIAL       some of the migration landed, some did not — investigate before
--                 doing anything else
--
-- What to do with the result is in docs/mobile-app-spec/99-DECISIONS.md.

with checks as (

  select '0001' as migration, 'auth: profiles/user_settings/favorites' as covers,
         (to_regclass('public.profiles')      is not null)::int
       + (to_regclass('public.user_settings') is not null)::int
       + (to_regclass('public.favorites')     is not null)::int as found, 3 as expected

  union all
  select '0002', 'match_notes',
         (to_regclass('public.match_notes') is not null)::int, 1

  union all
  -- 0007 renames orgs → shared_teams, so either name proves 0003 ran.
  select '0003', 'orgs / shared_teams core tables',
         ((to_regclass('public.orgs')         is not null or to_regclass('public.shared_teams')         is not null))::int
       + ((to_regclass('public.org_members')  is not null or to_regclass('public.shared_team_members')  is not null))::int
       + ((to_regclass('public.org_invites')  is not null or to_regclass('public.shared_team_invites')  is not null))::int, 3

  union all
  select '0004', 'peers-read-profiles policy + member index',
         (exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles'
                  and policyname in ('org peers read profiles','shared_team peers read profiles')))::int
       + (exists (select 1 from pg_indexes where schemaname = 'public'
                  and indexname in ('org_members_user_id_idx','shared_team_members_user_id_idx')))::int, 2

  union all
  select '0005', 'picklist table',
         ((to_regclass('public.org_picklists') is not null
           or to_regclass('public.shared_team_picklists') is not null))::int, 1

  union all
  select '0006', 'invites max_uses + use_count',
         (exists (select 1 from information_schema.columns where table_schema = 'public'
                  and table_name in ('org_invites','shared_team_invites') and column_name = 'max_uses'))::int
       + (exists (select 1 from information_schema.columns where table_schema = 'public'
                  and table_name in ('org_invites','shared_team_invites') and column_name = 'use_count'))::int, 2

  union all
  select '0007', 'rename orgs → shared_teams',
         (to_regclass('public.shared_teams')         is not null)::int
       + (to_regclass('public.shared_team_members')  is not null)::int
       + (to_regclass('public.orgs')                 is null)::int, 3

  union all
  -- 0008's distinctive artefact is a WITH CHECK (qual + with_check both present)
  -- on the members role-update policy. 0007 created it with USING only.
  select '0008', 'WITH CHECK on members role update',
         (exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'shared_team_members'
                    and policyname = 'shared_team owner admin update role'
                    and with_check is not null))::int, 1

  union all
  select '0009', 'event_grades',
         (to_regclass('public.event_grades') is not null)::int, 1

  union all
  select '0010', 'translations',
         (to_regclass('public.translations') is not null)::int, 1

  union all
  select '0011', 'private schema + definer functions moved',
         (exists (select 1 from pg_namespace where nspname = 'private'))::int
       + (exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'private' and p.proname = 'is_shared_team_member'))::int
       + (exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'private' and p.proname = 'join_shared_team_by_invite'))::int, 3

  union all
  select '0012', 'invite write restricted to owner/admin',
         (exists (select 1 from pg_policies where schemaname = 'public'
                  and tablename = 'shared_team_invites'
                  and policyname = 'shared_team admins create invites'))::int
       + (not exists (select 1 from pg_policies where schemaname = 'public'
                  and tablename = 'shared_team_invites'
                  and policyname = 'shared_team members manage invites'))::int, 2

  union all
  select '0013', 'picklist deleted_at + updated_at',
         (exists (select 1 from information_schema.columns where table_schema = 'public'
                  and table_name = 'shared_team_picklists' and column_name = 'deleted_at'))::int
       + (exists (select 1 from information_schema.columns where table_schema = 'public'
                  and table_name = 'shared_team_picklists' and column_name = 'updated_at'))::int, 2

  union all
  select '0014', 'account deletion',
         (exists (select 1 from information_schema.columns where table_schema = 'public'
                  and table_name = 'profiles' and column_name = 'deletion_requested_at'))::int
       + (exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'request_account_deletion'))::int, 2
)

select
  migration,
  case
    when found = expected then 'APPLIED'
    when found = 0        then 'NOT APPLIED'
    else 'PARTIAL'
  end as status,
  found || '/' || expected as objects,
  covers
from checks
order by migration;
