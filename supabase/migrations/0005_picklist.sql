-- Phase H: Per-org, per-event shared picklist for alliance selection scouting.
-- Run manually in Supabase SQL editor.

create table if not exists public.org_picklists (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs on delete cascade,
  event_id    text not null,
  team_id     text not null,        -- RobotEvents numeric team id as text
  team_number text not null,        -- denormalized: "12345A"
  team_name   text,                 -- denormalized: "Flying Robots" (optional)
  sort_order  float not null default 0,   -- fractional so insert-between never renumbers all
  notes       text,
  crossed_out boolean not null default false,
  added_by    uuid references auth.users,
  created_at  timestamptz not null default now(),
  unique (org_id, event_id, team_id)
);

alter table public.org_picklists enable row level security;

create policy "org members manage picklist" on public.org_picklists
  for all
  using  (public.is_org_member(org_id))
  with check (public.is_org_member(org_id));
