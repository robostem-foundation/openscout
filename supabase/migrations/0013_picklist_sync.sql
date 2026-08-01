-- 0013: Picklist sync correctness — tombstones and a modification timestamp.
-- Run manually in the Supabase SQL editor after 0012. Idempotent & transactional.
--
-- The bug this fixes shows up at the worst possible moment. `shared_team_picklists`
-- is merged localStorage-first by the client, and a hard DELETE leaves no record
-- that the row ever existed. So when member A removes a team from the picklist and
-- member B's client next loads with a stale local copy, B's copy re-inserts the
-- row — during live alliance selection, a team you crossed off un-crosses itself.
--
-- The table also had no `updated_at`, so there was no basis for ordering two
-- concurrent writes: last-write-wins was not merely unimplemented, it was
-- inexpressible. Both halves are needed for a correct sync.
--
--   deleted_at   Soft delete. A removal now writes a tombstone the other client
--                can see and honour instead of resurrecting the row.
--   updated_at   Maintained by trigger on every UPDATE, so a merge can compare.
--
-- Client contract after this migration:
--   * Reads filter `deleted_at is null`.
--   * Removing a team sets `deleted_at = now()`; it does not DELETE.
--   * Re-adding a team clears `deleted_at` (the unique constraint on
--     (shared_team_id, event_id, team_id) means the row is reused, not replaced).
--   * A merge prefers the higher `updated_at`; a tombstone wins ties.
--
-- Tombstones are pruned by `private.prune_picklist_tombstones()` below, which is
-- safe to call from a cron job or by hand. Nothing calls it automatically — a
-- tombstone costs one narrow row and events are short-lived.

begin;

alter table public.shared_team_picklists
  add column if not exists deleted_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

-- Partial index: every read filters on `deleted_at is null`, and the live subset
-- is small relative to accumulated tombstones.
create index if not exists shared_team_picklists_live_idx
  on public.shared_team_picklists (shared_team_id, event_id, sort_order)
  where deleted_at is null;

-- Touch `updated_at` on every UPDATE, including the soft delete itself, so a
-- client can never win a merge with a stale row that merely looks newer.
create or replace function private.touch_picklist_updated_at()
returns trigger language plpgsql
set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end; $$;

drop trigger if exists shared_team_picklists_touch_updated_at on public.shared_team_picklists;
create trigger shared_team_picklists_touch_updated_at
  before update on public.shared_team_picklists
  for each row execute function private.touch_picklist_updated_at();

-- Backfill: existing rows predate the column and all share its default, which is
-- correct — none of them has a pending concurrent write to lose to.

/**
 * Delete tombstones older than the given age. Safe to run at any time; a
 * tombstone only needs to outlive every client's local copy of that event.
 */
create or replace function private.prune_picklist_tombstones(p_older_than interval default interval '90 days')
returns integer language plpgsql security definer
set search_path = public as $$
declare v_count integer;
begin
  delete from public.shared_team_picklists
  where deleted_at is not null and deleted_at < now() - p_older_than;
  get diagnostics v_count = row_count;
  return v_count;
end; $$;

revoke execute on function private.prune_picklist_tombstones(interval) from public;

commit;
