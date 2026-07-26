-- 0010: shared translation cache.
-- Run manually in the Supabase SQL editor after 0009. Idempotent & transactional.
--
-- Non-English event/team/organization names are translated to English for
-- display. The only free engine that works in every browser (MyMemory) has a
-- 5,000-word/day anonymous quota, so every successful translation is written here
-- and never fetched again. The corpus of VEX names is finite and effectively
-- static, so steady state is a Postgres read and zero upstream traffic.
--
-- Chrome's on-device Translator results deliberately do NOT land here: anon
-- clients cannot write (see the policy note below), and mixing two engines'
-- output in one shared table would show two users different English for the
-- same name. Those results stay in the client's localStorage.
begin;

create table if not exists public.translations (
  -- sha256(source_lang || E'\n' || source_text), hex. Hashed rather than keyed on
  -- the text itself so the primary-key index can never hit Postgres' ~2704-byte
  -- btree limit on an unexpectedly long name.
  hash text primary key,
  source_text text not null,
  source_lang text not null,
  target_lang text not null default 'en',
  translated_text text not null,
  engine text not null default 'mymemory',
  created_at timestamptz not null default now()
);

alter table public.translations enable row level security;

-- Public read: every string in here is already public data rendered in a
-- signed-out view.
drop policy if exists "translations public read" on public.translations;
create policy "translations public read" on public.translations
  for select
  using (true);

-- No insert/update/delete policy on purpose: writes come from the serverless
-- translator using the service-role key, which bypasses RLS. Anon clients can
-- read the cache but cannot poison it.

commit;
