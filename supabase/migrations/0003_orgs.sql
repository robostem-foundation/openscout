-- Phase E: Organizations
-- Run manually in the Supabase SQL editor.

-- Organizations
create table if not exists public.orgs (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  owner_id     uuid references auth.users not null,
  team_program text,
  team_number  text,
  created_at   timestamptz not null default now()
);

-- Membership  (role: 'owner' | 'admin' | 'member')
create table if not exists public.org_members (
  org_id    uuid references public.orgs on delete cascade,
  user_id   uuid references auth.users on delete cascade,
  role      text not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

-- Invite tokens (single-use, 7-day expiry by default)
create table if not exists public.org_invites (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid references public.orgs on delete cascade,
  created_by uuid references auth.users,
  used_by    uuid references auth.users,
  expires_at timestamptz not null default now() + interval '7 days',
  created_at timestamptz not null default now()
);

-- Shared org favorites
create table if not exists public.org_favorites (
  org_id     uuid references public.orgs on delete cascade,
  kind       text not null,   -- 'team' | 'event'
  ref_id     text not null,
  added_by   uuid references auth.users,
  created_at timestamptz not null default now(),
  primary key (org_id, kind, ref_id)
);

-- Shared org match notes (separate from personal match_notes table)
create table if not exists public.org_match_notes (
  org_id         uuid references public.orgs on delete cascade,
  match_id       text not null,
  event_id       text,
  body           text not null default '',
  updated_at     timestamptz not null default now(),
  last_edited_by uuid references auth.users,
  primary key (org_id, match_id)
);

-- Enable RLS on all org tables
alter table public.orgs            enable row level security;
alter table public.org_members     enable row level security;
alter table public.org_invites     enable row level security;
alter table public.org_favorites   enable row level security;
alter table public.org_match_notes enable row level security;

-- ── Helper functions ──────────────────────────────────────────────────────────

-- Check whether the current user is a member of the given org
create or replace function public.is_org_member(p_org_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.org_members
    where org_members.org_id = p_org_id
      and org_members.user_id = auth.uid()
  )
$$;

-- ── RLS policies ──────────────────────────────────────────────────────────────

-- orgs: members/owner can read; any authenticated user can create (as owner); owner can update/delete
drop policy if exists "org members read"       on public.orgs;
drop policy if exists "authenticated create org" on public.orgs;
drop policy if exists "org owner update"       on public.orgs;
drop policy if exists "org owner delete"       on public.orgs;

create policy "org members read" on public.orgs
  for select using (public.is_org_member(id) or owner_id = auth.uid());

create policy "authenticated create org" on public.orgs
  for insert with check (auth.uid() = owner_id);

create policy "org owner update" on public.orgs
  for update using (owner_id = auth.uid());

create policy "org owner delete" on public.orgs
  for delete using (owner_id = auth.uid());

-- org_members: members can read; join is handled by the RPC below;
--              members can remove themselves; owner/admin can remove others
drop policy if exists "org members read members" on public.org_members;
drop policy if exists "org member self delete"   on public.org_members;

create policy "org members read members" on public.org_members
  for select using (public.is_org_member(org_id));

create policy "org member self delete" on public.org_members
  for delete using (
    user_id = auth.uid()
    or exists (
      select 1 from public.org_members m
      where m.org_id = org_members.org_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

create policy "org owner admin update role" on public.org_members
  for update using (
    exists (
      select 1 from public.org_members m
      where m.org_id = org_members.org_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

-- org_invites: org members can read/create/delete their org's invites
drop policy if exists "org members manage invites" on public.org_invites;

create policy "org members manage invites" on public.org_invites
  for all
  using (public.is_org_member(org_id))
  with check (public.is_org_member(org_id));

-- org_favorites: all members full access
drop policy if exists "org members manage favorites" on public.org_favorites;

create policy "org members manage favorites" on public.org_favorites
  for all
  using (public.is_org_member(org_id))
  with check (public.is_org_member(org_id));

-- org_match_notes: all members full access
drop policy if exists "org members manage notes" on public.org_match_notes;

create policy "org members manage notes" on public.org_match_notes
  for all
  using (public.is_org_member(org_id))
  with check (public.is_org_member(org_id));

-- ── RPCs ──────────────────────────────────────────────────────────────────────

-- peek_invite: returns org name + member count for the join page, readable
--              by anyone (no membership required) so un-authed users can see
--              the invite landing card before signing in.
create or replace function public.peek_invite(p_invite_id uuid)
returns jsonb
language plpgsql
security definer
stable
as $$
declare
  v_org_id      uuid;
  v_org_name    text;
  v_member_count int;
begin
  select org_id into v_org_id
  from public.org_invites
  where id = p_invite_id
    and expires_at > now()
    and used_by is null;

  if not found then
    return jsonb_build_object('valid', false);
  end if;

  select name into v_org_name from public.orgs where id = v_org_id;
  select count(*) into v_member_count from public.org_members where org_id = v_org_id;

  return jsonb_build_object(
    'valid',        true,
    'org_id',       v_org_id,
    'org_name',     v_org_name,
    'member_count', v_member_count
  );
end;
$$;

-- join_org_by_invite: atomic join — validates token, checks cap, inserts member, marks used.
create or replace function public.join_org_by_invite(p_invite_id uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_org_id       uuid;
  v_member_count int;
  v_org_name     text;
begin
  -- Validate invite (non-expired, single-use)
  select org_id into v_org_id
  from public.org_invites
  where id = p_invite_id
    and expires_at > now()
    and used_by is null;

  if not found then
    return jsonb_build_object('error', 'invite_invalid');
  end if;

  -- Check member cap
  select count(*) into v_member_count
  from public.org_members
  where org_id = v_org_id;

  if v_member_count >= 20 then
    return jsonb_build_object('error', 'org_full');
  end if;

  -- Already a member?
  if exists (
    select 1 from public.org_members
    where org_id = v_org_id and user_id = auth.uid()
  ) then
    return jsonb_build_object('ok', true, 'already_member', true, 'org_id', v_org_id);
  end if;

  -- Join
  insert into public.org_members (org_id, user_id, role)
  values (v_org_id, auth.uid(), 'member');

  -- Mark invite used
  update public.org_invites
  set used_by = auth.uid()
  where id = p_invite_id;

  select name into v_org_name from public.orgs where id = v_org_id;

  return jsonb_build_object('ok', true, 'org_id', v_org_id, 'org_name', v_org_name);
end;
$$;
