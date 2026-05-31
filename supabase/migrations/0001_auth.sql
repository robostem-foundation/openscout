-- stemScout — Phase A auth schema
-- Run in the Supabase SQL editor (or via the CLI) once per project.
-- Safe to re-run: guarded with "if not exists" / "drop ... if exists".

-- ---------------------------------------------------------------------------
-- profiles: one row per auth user, auto-created on signup by the trigger below.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text,
  avatar_url text,
  provider text,                                  -- 'discord' | 'google'
  team_number text,
  team_program text,                              -- RobotEvents program id as text: '1' V5RC, '41' VIQRC, '4' VURC, '57' VAIRC
  theme text default 'system',                    -- 'light' | 'dark' | 'system'
  onboarding_done boolean not null default false,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- user_settings: free-form jsonb for synced preferences (Phase C).
-- ---------------------------------------------------------------------------
create table if not exists public.user_settings (
  user_id uuid primary key references auth.users on delete cascade,
  settings jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- favorites: synced team/event bookmarks (Phase B).
-- ---------------------------------------------------------------------------
create table if not exists public.favorites (
  user_id uuid references auth.users on delete cascade,
  kind text not null,                             -- 'team' | 'event'
  ref_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, kind, ref_id)
);

-- ---------------------------------------------------------------------------
-- Row Level Security: every row is private to its owner.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.favorites enable row level security;

drop policy if exists "profiles are self-owned" on public.profiles;
create policy "profiles are self-owned" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "settings are self-owned" on public.user_settings;
create policy "settings are self-owned" on public.user_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "favorites are self-owned" on public.favorites;
create policy "favorites are self-owned" on public.favorites
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Auto-create a profile row when a new auth user signs up.
-- security definer lets the trigger bypass RLS for the insert.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, avatar_url, provider)
  values (
    new.id,
    new.raw_user_meta_data ->> 'avatar_url',
    new.raw_app_meta_data ->> 'provider'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
