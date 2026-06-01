-- stemScout — Phase D: per-match personal notes
-- Run in the Supabase SQL editor (or via the CLI) once per project.
-- Safe to re-run: guarded with "if not exists" / "drop ... if exists".

-- ---------------------------------------------------------------------------
-- match_notes: one row per (user, match). body holds freeform text; inline
-- [m:ss] tokens are rendered as clickable seek links in the video panel.
-- match_id / event_id are RobotEvents numeric ids stored as text (matches the
-- favorites.ref_id convention). Empty notes are deleted, never stored.
-- ---------------------------------------------------------------------------
create table if not exists public.match_notes (
  user_id uuid references auth.users on delete cascade,
  match_id text not null,
  event_id text,
  body text not null default '',
  updated_at timestamptz not null default now(),
  primary key (user_id, match_id)
);

-- ---------------------------------------------------------------------------
-- Row Level Security: every note is private to its owner.
-- ---------------------------------------------------------------------------
alter table public.match_notes enable row level security;

drop policy if exists "match notes are self-owned" on public.match_notes;
create policy "match notes are self-owned" on public.match_notes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
