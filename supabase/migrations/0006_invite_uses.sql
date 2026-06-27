-- Phase: configurable multi-use invites.
-- Invites gain a usage cap (max_uses, NULL = unlimited) + a counter (use_count),
-- and expiry becomes optional (expires_at NULL = never expires).
-- Run in the Supabase SQL editor (or applied via the Management API).

-- ── 1. Schema ─────────────────────────────────────────────────────────────────
alter table public.org_invites
  add column if not exists max_uses  int,                      -- NULL = unlimited
  add column if not exists use_count int not null default 0;

-- Expiry is now chosen per-invite and may be omitted entirely.
alter table public.org_invites
  alter column expires_at drop not null,
  alter column expires_at drop default;

-- Backfill legacy rows as single-use to preserve their original behaviour.
update public.org_invites
  set max_uses  = 1,
      use_count = case when used_by is not null then 1 else 0 end
  where max_uses is null;

-- New rows default to single-use unless the app specifies a cap (or NULL = unlimited).
alter table public.org_invites
  alter column max_uses set default 1;

-- ── 2. peek_invite: valid while not expired AND not exhausted ────────────────────
create or replace function public.peek_invite(p_invite_id uuid)
returns jsonb
language plpgsql
security definer
stable
as $$
declare
  v_org_id       uuid;
  v_org_name     text;
  v_member_count int;
begin
  select org_id into v_org_id
  from public.org_invites
  where id = p_invite_id
    and (expires_at is null or expires_at > now())
    and (max_uses is null or use_count < max_uses);

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

-- ── 3. join_org_by_invite: atomic, multi-use aware ──────────────────────────────
-- Locks the invite row (FOR UPDATE) so concurrent joins can't exceed max_uses.
-- A use is consumed only when a *new* member is actually inserted; re-joins by an
-- existing member are idempotent and free.
create or replace function public.join_org_by_invite(p_invite_id uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_org_id       uuid;
  v_max_uses     int;
  v_use_count    int;
  v_member_count int;
  v_org_name     text;
begin
  select org_id, max_uses, use_count
    into v_org_id, v_max_uses, v_use_count
  from public.org_invites
  where id = p_invite_id
    and (expires_at is null or expires_at > now())
  for update;

  if not found then
    return jsonb_build_object('error', 'invite_invalid');
  end if;

  if v_max_uses is not null and v_use_count >= v_max_uses then
    return jsonb_build_object('error', 'invite_invalid');
  end if;

  -- Already a member? Idempotent, and does not consume a use.
  if exists (
    select 1 from public.org_members
    where org_id = v_org_id and user_id = auth.uid()
  ) then
    return jsonb_build_object('ok', true, 'already_member', true, 'org_id', v_org_id);
  end if;

  -- Member cap
  select count(*) into v_member_count
  from public.org_members
  where org_id = v_org_id;

  if v_member_count >= 20 then
    return jsonb_build_object('error', 'org_full');
  end if;

  insert into public.org_members (org_id, user_id, role)
  values (v_org_id, auth.uid(), 'member');

  update public.org_invites
  set use_count = use_count + 1,
      used_by   = auth.uid()       -- retained as "last joined by" for reference
  where id = p_invite_id;

  select name into v_org_name from public.orgs where id = v_org_id;

  return jsonb_build_object('ok', true, 'org_id', v_org_id, 'org_name', v_org_name);
end;
$$;
