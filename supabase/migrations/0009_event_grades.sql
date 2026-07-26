-- 0009: event grade-level cache.
-- Run manually in the Supabase SQL editor after 0008. Idempotent & transactional.
--
-- RobotEvents exposes an event's grade level ONLY as a line of server-rendered
-- text on the public event page ("Grade Level: Elementary" / "Middle School" /
-- "High School" / "All"). Neither the v2 API nor the RoboSTEM mirror returns it,
-- and the API silently ignores grade query params. Scraping it costs one
-- third-party proxy request per event, against a monthly quota — so every
-- successful lookup is written here and never fetched again. Grade level is
-- fixed when the event is created, so these rows do not expire.
begin;

create table if not exists public.event_grades (
  sku text primary key,
  program_id integer,
  -- Canonical codes, low → high: subset of {ES, MS, HS, U}. "All" on the event
  -- page is expanded to the program's full span before it lands here, so a
  -- reader never has to know which program a code set came from.
  grades text[] not null,
  -- The raw scraped label, kept for debugging/re-interpretation without refetching.
  grade_label text,
  checked_at timestamptz not null default now()
);

alter table public.event_grades enable row level security;

-- Public read: grade level is public information and the tables that render it
-- are visible to signed-out visitors.
drop policy if exists "event_grades public read" on public.event_grades;
create policy "event_grades public read" on public.event_grades
  for select
  using (true);

-- No insert/update/delete policy on purpose: writes come from the serverless
-- scraper using the service-role key, which bypasses RLS. Anon clients can read
-- the cache but cannot poison it.

commit;
