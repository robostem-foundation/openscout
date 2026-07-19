# Org → Shared Team Rename — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the "Org" concept to "Shared Team" end-to-end (copy, URLs, code identifiers, DB), and make Create-Shared-Team default its team identity from the user's "My Team" profile.

**Architecture:** A mostly-mechanical rename across a small dependency graph. The DB migration renames tables/columns/policies/RPCs in place (no data loss). The TS rename is a coupled symbol graph consumed by `App.tsx` (one ~16k-line file), `auth.tsx`, and `org-aggregate.ts`, so the code rename lands as a coordinated unit verified by one `npm run build`. Two pieces are genuinely independent and parallelizable: the SQL migration file and the CSS class rename.

**Tech Stack:** React + TypeScript (Vite), Supabase (Postgres + RLS + RPCs), single-file component tree in `src/App.tsx`.

## Global Constraints

Every task uses these exact names. Do not invent variants.

**User-facing term:** "Shared Team" (verbs: "Create a shared team", "Join a shared team", panel/section title "Shared Team").

**Do NOT rename `teamId` / `teamNumber`** — those already mean *VEX RobotEvents team* and must be left alone. Only `org*` identifiers change.

**URL map** (add client redirect from old → new; `/join/:token` unchanged):
| Old | New |
|---|---|
| `/org/:id` | `/shared-team/:id` |
| `/org/:id/settings` | `/shared-team/:id/settings` |

**DB name map:**
| Old | New |
|---|---|
| table `orgs` | `shared_teams` |
| table `org_members` | `shared_team_members` |
| table `org_invites` | `shared_team_invites` |
| table `org_favorites` | `shared_team_favorites` |
| table `org_match_notes` | `shared_team_match_notes` |
| table `org_picklists` | `shared_team_picklists` |
| column `org_id` (all child tables) | `shared_team_id` |
| fn `is_org_member` | `is_shared_team_member` |
| rpc `join_org_by_invite` | `join_shared_team_by_invite` |
| rpc `peek_invite` | `peek_invite` (name kept; body + keys change) |
| RPC JSON key `org_id` | `shared_team_id` |
| RPC JSON key `org_name` | `shared_team_name` |

**TS symbol map:**
| Old | New |
|---|---|
| file `src/orgs.ts` | `src/shared-teams.ts` |
| file `src/org-favorites.ts` | `src/shared-team-favorites.ts` |
| file `src/org-notes.ts` | `src/shared-team-notes.ts` |
| file `src/org-aggregate.ts` | `src/shared-team-aggregate.ts` |
| file `src/picklist.ts` | `src/picklist.ts` (kept; internals renamed) |
| type `OrgRole` | `SharedTeamRole` |
| type `OrgMembership` | `SharedTeamMembership` |
| type `OrgInvite` | `SharedTeamInvite` |
| type `OrgMember` | `SharedTeamMember` |
| var/param `orgId` | `sharedTeamId` |
| `createOrg` | `createSharedTeam` |
| `updateOrg` | `updateSharedTeam` |
| `leaveOrg` | `leaveSharedTeam` |
| `deleteOrg` | `deleteSharedTeam` |
| `useOrgs` | `useSharedTeams` |
| `useOrg` | `useSharedTeam` |
| `useOrgsReady` | `useSharedTeamsReady` |
| `getOrgInvites` | `getSharedTeamInvites` |
| `getOrgMembers` | `getSharedTeamMembers` |
| `reloadOrgs` | `reloadSharedTeams` |
| `generateInvite` / `revokeInvite` / `removeMember` / `updateMemberRole` | unchanged (not org-named) |

**Component map (App.tsx):**
| Old | New |
|---|---|
| `CreateOrgModal` | `CreateSharedTeamModal` |
| `OrgPanel` | `SharedTeamPanel` |
| `JoinOrgPage` | `JoinSharedTeamPage` |
| `OrgWorkspacePage` | `SharedTeamWorkspacePage` |
| `OrgSettingsSection` | `SharedTeamSettingsSection` |
| `OrgFavoritesTab` | `SharedTeamFavoritesTab` |
| `OrgFavoritesList` | `SharedTeamFavoritesList` |
| `OrgFavBtn` | `SharedTeamFavBtn` |
| `OrgFavoriteButton` | `SharedTeamFavoriteButton` |

**CSS class map** (prefix rename; keep in sync with JSX):
`org-panel*`→`shared-team-panel*`, `org-fav*`→`shared-team-fav*`, `org-member*`→`shared-team-member*`, `join-org*`→`join-shared-team*`, `mobile-nav-org-badge`→`mobile-nav-shared-team-badge`, `auth-menu-org*`→`auth-menu-shared-team*`.

**Verification commands:** `npm run build` (tsc -b && vite build) and `npm run lint`. There is no unit-test suite; tasks verify via build, `grep` sweeps, and browser preview.

**Parallelization:** Task 1 (SQL) and Task 7 (CSS) are independent of the TS build graph and of each other — run them in parallel with the code rename. Tasks 2–6 are a single coupled TS unit and must be done in order; the build only goes green at the end of Task 6.

---

### Task 1: DB migration file (independent — parallelizable)

**Files:**
- Create: `supabase/migrations/0007_rename_orgs_to_shared_teams.sql`

**Interfaces:**
- Produces: renamed tables/columns/policies/fn/RPCs per the DB name map. The new RPC return keys (`shared_team_id`, `shared_team_name`) are consumed by Task 6's `PeekResult` type + join handler.

- [ ] **Step 1: Write the migration**

```sql
-- 0007: Rename Org → Shared Team (in-place, no data loss).
-- Run manually in the Supabase SQL editor (or Management API) in one transaction.
begin;

-- ── 1. Tables ────────────────────────────────────────────────────────────────
alter table public.orgs            rename to shared_teams;
alter table public.org_members     rename to shared_team_members;
alter table public.org_invites     rename to shared_team_invites;
alter table public.org_favorites   rename to shared_team_favorites;
alter table public.org_match_notes rename to shared_team_match_notes;
alter table public.org_picklists   rename to shared_team_picklists;

-- ── 2. Columns (org_id → shared_team_id on every child table) ────────────────
alter table public.shared_team_members     rename column org_id to shared_team_id;
alter table public.shared_team_invites     rename column org_id to shared_team_id;
alter table public.shared_team_favorites   rename column org_id to shared_team_id;
alter table public.shared_team_match_notes rename column org_id to shared_team_id;
alter table public.shared_team_picklists   rename column org_id to shared_team_id;

-- ── 3. Index rename (from 0004) ──────────────────────────────────────────────
alter index if exists org_members_user_id_idx rename to shared_team_members_user_id_idx;

-- ── 4. Helper fn: is_shared_team_member ──────────────────────────────────────
create or replace function public.is_shared_team_member(p_shared_team_id uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.shared_team_members
    where shared_team_members.shared_team_id = p_shared_team_id
      and shared_team_members.user_id = auth.uid()
  )
$$;

-- ── 5. Drop old policies (names referenced old fn/tables) ─────────────────────
drop policy if exists "org members read"            on public.shared_teams;
drop policy if exists "authenticated create org"    on public.shared_teams;
drop policy if exists "org owner update"            on public.shared_teams;
drop policy if exists "org owner delete"            on public.shared_teams;
drop policy if exists "org members read members"    on public.shared_team_members;
drop policy if exists "org member self delete"      on public.shared_team_members;
drop policy if exists "org owner admin update role" on public.shared_team_members;
drop policy if exists "org owner initial member"    on public.shared_team_members;
drop policy if exists "org members manage invites"  on public.shared_team_invites;
drop policy if exists "org members manage favorites" on public.shared_team_favorites;
drop policy if exists "org members manage notes"    on public.shared_team_match_notes;
drop policy if exists "org members manage picklist" on public.shared_team_picklists;
drop policy if exists "org peers read profiles"     on public.profiles;

-- ── 6. Recreate policies against renamed tables/columns/fn ────────────────────
create policy "shared_team members read" on public.shared_teams
  for select using (public.is_shared_team_member(id) or owner_id = auth.uid());
create policy "shared_team authenticated create" on public.shared_teams
  for insert with check (auth.uid() = owner_id);
create policy "shared_team owner update" on public.shared_teams
  for update using (owner_id = auth.uid());
create policy "shared_team owner delete" on public.shared_teams
  for delete using (owner_id = auth.uid());

create policy "shared_team members read members" on public.shared_team_members
  for select using (public.is_shared_team_member(shared_team_id));
create policy "shared_team member self delete" on public.shared_team_members
  for delete using (
    user_id = auth.uid()
    or exists (select 1 from public.shared_team_members m
      where m.shared_team_id = shared_team_members.shared_team_id
        and m.user_id = auth.uid() and m.role in ('owner','admin'))
  );
create policy "shared_team owner admin update role" on public.shared_team_members
  for update using (
    exists (select 1 from public.shared_team_members m
      where m.shared_team_id = shared_team_members.shared_team_id
        and m.user_id = auth.uid() and m.role in ('owner','admin'))
  );
create policy "shared_team owner initial member" on public.shared_team_members
  for insert with check (
    user_id = auth.uid()
    and exists (select 1 from public.shared_teams
      where id = shared_team_members.shared_team_id and owner_id = auth.uid())
  );

create policy "shared_team members manage invites" on public.shared_team_invites
  for all using (public.is_shared_team_member(shared_team_id))
  with check (public.is_shared_team_member(shared_team_id));
create policy "shared_team members manage favorites" on public.shared_team_favorites
  for all using (public.is_shared_team_member(shared_team_id))
  with check (public.is_shared_team_member(shared_team_id));
create policy "shared_team members manage notes" on public.shared_team_match_notes
  for all using (public.is_shared_team_member(shared_team_id))
  with check (public.is_shared_team_member(shared_team_id));
create policy "shared_team members manage picklist" on public.shared_team_picklists
  for all using (public.is_shared_team_member(shared_team_id))
  with check (public.is_shared_team_member(shared_team_id));

create policy "shared_team peers read profiles" on public.profiles
  for select using (
    exists (select 1 from public.shared_team_members m1
      join public.shared_team_members m2 on m1.shared_team_id = m2.shared_team_id
      where m1.user_id = auth.uid() and m2.user_id = profiles.id)
  );

-- ── 7. RPCs: peek_invite (kept name) + join_shared_team_by_invite ────────────
create or replace function public.peek_invite(p_invite_id uuid)
returns jsonb language plpgsql security definer stable as $$
declare v_id uuid; v_name text; v_count int;
begin
  select shared_team_id into v_id from public.shared_team_invites
  where id = p_invite_id
    and (expires_at is null or expires_at > now())
    and (max_uses is null or use_count < max_uses);
  if not found then return jsonb_build_object('valid', false); end if;
  select name into v_name from public.shared_teams where id = v_id;
  select count(*) into v_count from public.shared_team_members where shared_team_id = v_id;
  return jsonb_build_object('valid', true, 'shared_team_id', v_id,
    'shared_team_name', v_name, 'member_count', v_count);
end; $$;

create or replace function public.join_shared_team_by_invite(p_invite_id uuid)
returns jsonb language plpgsql security definer as $$
declare v_id uuid; v_max int; v_used int; v_count int; v_name text;
begin
  select shared_team_id, max_uses, use_count into v_id, v_max, v_used
  from public.shared_team_invites
  where id = p_invite_id and (expires_at is null or expires_at > now())
  for update;
  if not found then return jsonb_build_object('error','invite_invalid'); end if;
  if v_max is not null and v_used >= v_max then
    return jsonb_build_object('error','invite_invalid'); end if;
  if exists (select 1 from public.shared_team_members
      where shared_team_id = v_id and user_id = auth.uid()) then
    return jsonb_build_object('ok',true,'already_member',true,'shared_team_id',v_id); end if;
  select count(*) into v_count from public.shared_team_members where shared_team_id = v_id;
  if v_count >= 20 then return jsonb_build_object('error','shared_team_full'); end if;
  insert into public.shared_team_members (shared_team_id, user_id, role)
    values (v_id, auth.uid(), 'member');
  update public.shared_team_invites set use_count = use_count + 1, used_by = auth.uid()
    where id = p_invite_id;
  select name into v_name from public.shared_teams where id = v_id;
  return jsonb_build_object('ok',true,'shared_team_id',v_id,'shared_team_name',v_name);
end; $$;

drop function if exists public.join_org_by_invite(uuid);
drop function if exists public.is_org_member(uuid);

commit;
```

- [ ] **Step 2: Self-verify SQL**

Read the file back and confirm: every old policy name in the `drop` block matches a name created in `0003`/`0004`/`0005`; no reference to `org_id`/`orgs`/`is_org_member` remains except the two `drop ... if exists` lines. This migration is **not applied** here — applying to the live Supabase project is the user's action.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0007_rename_orgs_to_shared_teams.sql
git commit -m "db: migration to rename orgs → shared_teams (tables, policies, RPCs)"
```

---

### Task 2: Rename core module `orgs.ts` → `shared-teams.ts`

**Files:**
- Rename: `src/orgs.ts` → `src/shared-teams.ts`
- Modify: the renamed file (symbols, DB strings, RPC JSON key)

**Interfaces:**
- Produces: all exports under the TS symbol map. Consumed by Tasks 4, 5, 6.

- [ ] **Step 1: Rename the file**

```bash
git mv src/orgs.ts src/shared-teams.ts
```

- [ ] **Step 2: Apply the symbol + DB-string rename inside the file**

Apply per Global Constraints: types (`OrgRole→SharedTeamRole`, `OrgMembership→SharedTeamMembership`, `OrgInvite→SharedTeamInvite`, `OrgMember→SharedTeamMember`), functions (`createOrg→createSharedTeam`, `updateOrg→updateSharedTeam`, `leaveOrg→leaveSharedTeam`, `deleteOrg→deleteSharedTeam`, `useOrgs→useSharedTeams`, `useOrg→useSharedTeam`, `useOrgsReady→useSharedTeamsReady`, `getOrgInvites→getSharedTeamInvites`, `getOrgMembers→getSharedTeamMembers`, `reloadOrgs→reloadSharedTeams`), all local `orgId`/`orgs` vars → `sharedTeamId`/`sharedTeams`, DB strings `.from("orgs")→.from("shared_teams")`, `.from("org_members")→.from("shared_team_members")`, `.from("org_invites")→.from("shared_team_invites")`, every `"org_id"`/`org_id:` → `"shared_team_id"`/`shared_team_id:`, the join select `orgs(id, name, team_program, team_number)` → `shared_teams(id, name, team_program, team_number)` (and the `row.orgs` reads → `row.shared_teams`), and the invite row map `orgId: row.org_id` → `sharedTeamId: row.shared_team_id`. Keep `generateInvite`, `revokeInvite`, `removeMember`, `updateMemberRole` names.

- [ ] **Step 3: Verify no stray old names in this file**

Run: `grep -nE "\borg(s|Id|_id|_members|_invites)?\b|Org(Role|Membership|Invite|Member)|createOrg|useOrgs?\b" src/shared-teams.ts`
Expected: no matches. (Build stays red until Task 6 — that's expected.)

- [ ] **Step 4: Commit**

```bash
git add -A src/shared-teams.ts
git commit -m "refactor: rename orgs.ts → shared-teams.ts (symbols + DB strings)"
```

---

### Task 3: Rename leaf modules `org-favorites` / `org-notes`, update `picklist.ts`

**Files:**
- Rename: `src/org-favorites.ts` → `src/shared-team-favorites.ts`, `src/org-notes.ts` → `src/shared-team-notes.ts`
- Modify: both renamed files + `src/picklist.ts`

**Interfaces:**
- Consumes: nothing (leaf modules; no local imports).
- Produces: renamed hooks/fns consumed by App.tsx (Task 6) and org-aggregate (Task 4). Preserve existing export *base* names where they are not org-named (e.g. `useOrgFavorites` → `useSharedTeamFavorites`, `toggleOrgFavorite` → `toggleSharedTeamFavorite`, `useIsOrgFavorite` → `useIsSharedTeamFavorite`; `useOrgMatchNote`/`setOrgMatchNote`/`useHasAnyOrgNote`/`useOrgNotesList` → `useSharedTeamMatchNote`/`setSharedTeamMatchNote`/`useHasAnySharedTeamNote`/`useSharedTeamNotesList`; `OrgNoteListItem` → `SharedTeamNoteListItem`).

- [ ] **Step 1: Rename files**

```bash
git mv src/org-favorites.ts src/shared-team-favorites.ts
git mv src/org-notes.ts src/shared-team-notes.ts
```

- [ ] **Step 2: Rename inside both files** — all `org`-prefixed exports per the interface note above, all local `orgId` → `sharedTeamId`, DB strings `.from("org_favorites")→.from("shared_team_favorites")`, `.from("org_match_notes")→.from("shared_team_match_notes")`, every `org_id` → `shared_team_id` (including `onConflict: "org_id,kind,ref_id"` → `"shared_team_id,kind,ref_id"` and `"org_id,match_id"` → `"shared_team_id,match_id"`).

- [ ] **Step 3: Update `picklist.ts`** — rename all `orgId` params → `sharedTeamId`; export `listOrgPicklistEvents` → `listSharedTeamPicklistEvents`, type `OrgPicklistSummary` → `SharedTeamPicklistSummary`; DB `.from("org_picklists")→.from("shared_team_picklists")`, every `org_id` → `shared_team_id` (incl. `onConflict: "org_id,event_id,team_id"` → `"shared_team_id,event_id,team_id"`). **Do NOT change** the localStorage key literal `` `picklist:${sharedTeamId}:${eventId}` `` prefix string `picklist:` (keys hold live device-local data).

- [ ] **Step 4: Verify**

Run: `grep -nE "org_id|org-|OrgFavorite|OrgMatchNote|OrgNote|OrgPicklist|listOrgPicklist|\borgId\b" src/shared-team-favorites.ts src/shared-team-notes.ts src/picklist.ts`
Expected: no matches.

- [ ] **Step 5: Commit**

```bash
git add -A src/shared-team-favorites.ts src/shared-team-notes.ts src/picklist.ts
git commit -m "refactor: rename org-favorites/org-notes modules + picklist internals"
```

---

### Task 4: Rename `org-aggregate.ts` → `shared-team-aggregate.ts`

**Files:**
- Rename: `src/org-aggregate.ts` → `src/shared-team-aggregate.ts`

**Interfaces:**
- Consumes: `getSharedTeamMembers` from `./shared-teams` (Task 2); `listSharedTeamPicklistEvents` + `SharedTeamPicklistSummary` from `./picklist` (Task 3).
- Produces: `useEventNames`, `useSharedTeamPicklistEvents` (was `useOrgPicklistEvents`), `loadSharedTeamActivity` (was `loadOrgActivity`), `ActivityItem` — consumed by App.tsx (Task 6).

- [ ] **Step 1: Rename file**

```bash
git mv src/org-aggregate.ts src/shared-team-aggregate.ts
```

- [ ] **Step 2: Update imports + internals** — `import { getOrgMembers } from "./orgs"` → `import { getSharedTeamMembers } from "./shared-teams"`; `import { listOrgPicklistEvents } from "./picklist"` → `listSharedTeamPicklistEvents`; `import type { OrgPicklistSummary }` → `SharedTeamPicklistSummary`; exports `useOrgPicklistEvents → useSharedTeamPicklistEvents`, `loadOrgActivity → loadSharedTeamActivity`; all `orgId` → `sharedTeamId`; DB strings `.from("org_match_notes"/"org_picklists"/"org_favorites")` → `shared_team_*`, `eq("org_id",…)` → `eq("shared_team_id",…)`.

- [ ] **Step 3: Verify**

Run: `grep -nE "org_id|\./orgs|\borgId\b|OrgPicklist|loadOrgActivity|useOrgPicklist|getOrgMembers|listOrgPicklist" src/shared-team-aggregate.ts`
Expected: no matches.

- [ ] **Step 4: Commit**

```bash
git add -A src/shared-team-aggregate.ts
git commit -m "refactor: rename org-aggregate.ts → shared-team-aggregate.ts"
```

---

### Task 5: Update `auth.tsx` consumers

**Files:**
- Modify: `src/auth.tsx:6,323,399-409`

**Interfaces:**
- Consumes: `useSharedTeams` from `./shared-teams` (Task 2).

- [ ] **Step 1: Rename usages** — `import { useOrgs } from "./orgs"` → `import { useSharedTeams } from "./shared-teams"`; `const orgs = useOrgs()` → `const sharedTeams = useSharedTeams()`; update the menu block: `orgs.length` → `sharedTeams.length`, label `Your {…} org/orgs` → `Your {…} team/teams` (shared-team wording), `org.orgId` → `t.sharedTeamId`, `goTo(`/org/${…}`)` → `goTo(`/shared-team/${…}`)`, classes `auth-menu-orgs`→`auth-menu-shared-teams`, `auth-menu-org`→`auth-menu-shared-team`, `auth-menu-org-badge`→`auth-menu-shared-team-badge`.

- [ ] **Step 2: Verify**

Run: `grep -nE "useOrgs|\borgs\b|\borg\b|/org/|auth-menu-org" src/auth.tsx`
Expected: no matches.

- [ ] **Step 3: Commit**

```bash
git add src/auth.tsx
git commit -m "refactor: auth menu uses shared-team naming"
```

---

### Task 6: Update `src/App.tsx` (imports, components, routes, RPC keys, create-modal UX, copy)

**Files:**
- Modify: `src/App.tsx` (imports ~80-103; components + routes throughout)

**Interfaces:**
- Consumes: all renamed exports from Tasks 2–4.

- [ ] **Step 1: Update imports** — the import block (`src/App.tsx:80-103`) to pull renamed symbols from `./shared-teams`, `./shared-team-notes`, `./shared-team-favorites`, `./shared-team-aggregate` per the maps. Update all `import type { OrgInvite, OrgMember, OrgMembership, OrgRole }` → the `SharedTeam*` types.

- [ ] **Step 2: Rename components** per the Component map. Also rename all `orgId` props/params/vars → `sharedTeamId`, `org` local vars → `team` (or `sharedTeam`) where they hold a `SharedTeamMembership`, and hook calls (`useOrgs`→`useSharedTeams`, etc.).

- [ ] **Step 3: Routes + redirect** — in the dispatcher (`src/App.tsx:~15989-16010`):
  - Change `const orgMatch = path.match(/^\/org\/([0-9a-f-]+)(?:\/settings)?$/i)` to match `/shared-team/`:
    ```ts
    // Redirect legacy /org/:id[/settings] → /shared-team/:id[/settings]
    const legacyOrg = path.match(/^\/org\/([0-9a-f-]+)((?:\/settings)?)$/i);
    if (legacyOrg) { navigate(`/shared-team/${legacyOrg[1]}${legacyOrg[2]}`); return null; }
    const stMatch = path.match(/^\/shared-team\/([0-9a-f-]+)(?:\/settings)?$/i);
    if (stMatch) return <SharedTeamWorkspacePage sharedTeamId={stMatch[1]} />;
    ```
    (Place the redirect + match where `orgMatch` was, before `compareMatch`; keep `joinMatch` above it. Confirm `navigate` returns void and returning `null` from the render dispatcher is valid — it renders nothing for the tick before the redirect re-renders.)
  - Update `navigate(`/org/${orgId}/settings`)` (create modal) → `/shared-team/${sharedTeamId}/settings`; `go(`/org/${org.orgId}`)` (mobile nav) → `/shared-team/${t.sharedTeamId}`; `href={`/org/${org.orgId}/settings`}` (panel Manage) → `/shared-team/…`; `url = `${origin}/join/${…}`` unchanged.
  - Update `recordBreadcrumb` if it references `/org` (grep to confirm; add `/shared-team` handling mirroring existing entity pages if present).

- [ ] **Step 4: RPC keys in JoinSharedTeamPage** — `type PeekResult = { valid: boolean; org_id?; org_name?; member_count? }` → `{ valid: boolean; shared_team_id?: string; shared_team_name?: string; member_count?: number }`; `supabase.rpc("join_org_by_invite", …)` → `rpc("join_shared_team_by_invite", …)`; `peek_invite` call unchanged; every `info.org_name` → `info.shared_team_name`; copy "Join {name}", "Sign in to join this org." → "…this shared team.", "Welcome to {name}!" unchanged.

- [ ] **Step 5: Create-Shared-Team modal UX** — replace `CreateSharedTeamModal` body so team fields default from My Team. Read `const { profile } = useAuth();` and:

```tsx
function CreateSharedTeamModal({ onClose }: { onClose: () => void }) {
  const { profile } = useAuth();
  const myProgram = profile?.team_program ?? "";
  const myNumber = profile?.team_number ?? "";
  const hasMyTeam = !!(myProgram && myNumber);

  const [name, setName] = useState("");
  const [override, setOverride] = useState(!hasMyTeam); // no My Team ⇒ show fields
  const [program, setProgram] = useState(myProgram);
  const [teamNumber, setTeamNumber] = useState(myNumber);
  const [saving, setSaving] = useState(false);

  // When not overriding, the shared team inherits My Team's identity.
  const effProgram = override ? program : myProgram;
  const effNumber = override ? teamNumber : myNumber;

  const handleCreate = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const id = await createSharedTeam(name.trim(), effProgram || null, effNumber.trim() || null);
      navigate(`/shared-team/${id}/settings`);
    } finally { setSaving(false); onClose(); }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Create a shared team</DialogTitle></DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="st-name-input">Name</FieldLabel>
            <Input id="st-name-input" value={name} autoFocus
              onChange={(e) => setName(e.target.value.slice(0, 40))}
              placeholder="e.g. 169W Scouting"
              onKeyDown={(e) => { if (e.key === "Enter") void handleCreate(); }} />
          </Field>

          {hasMyTeam && !override && (
            <div className="shared-team-identity-summary">
              <span>Scouting for: {programLabel(myProgram)} {myNumber}</span>
              <label className="shared-team-override-toggle">
                <Checkbox checked={override}
                  onCheckedChange={(v) => setOverride(v === true)} />
                This shared team scouts for a different team
              </label>
            </div>
          )}

          {override && (
            <>
              {hasMyTeam && (
                <label className="shared-team-override-toggle">
                  <Checkbox checked={override}
                    onCheckedChange={(v) => setOverride(v === true)} />
                  This shared team scouts for a different team
                </label>
              )}
              <div className="grid grid-cols-2 gap-4">
                <Field>
                  <FieldLabel htmlFor="st-program-select">Program</FieldLabel>
                  <Select value={program || "none"}
                    onValueChange={(v) => setProgram(v === "none" ? "" : v)}>
                    <SelectTrigger id="st-program-select" className="w-full">
                      <SelectValue placeholder="Any / none" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Any / none</SelectItem>
                      {AUTH_PROGRAMS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="st-team-input">Team #</FieldLabel>
                  <Input id="st-team-input" value={teamNumber}
                    onChange={(e) => setTeamNumber(e.target.value.slice(0, 10))}
                    placeholder="e.g. 169W" />
                </Field>
              </div>
            </>
          )}
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void handleCreate()} disabled={!name.trim() || saving}>
            {saving ? "Creating…" : "Create shared team"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

  Confirm `Checkbox` is imported (`src/components/ui/checkbox.tsx` exists) and `programLabel` + `AUTH_PROGRAMS` are in scope (both already used in App.tsx).

- [ ] **Step 6: Remaining copy sweep in App.tsx** — panel titles "Your Org"/"Org / Team"/"Org not found…" → "Shared Team"/"Shared Team not found…"; empty-state "Collaborate with your scouting team." kept; "Create an org" → "Create a shared team"; "Or ask your coach for an invite link." kept; nav mobile badge class; "Join or create an org to use shared picklists." → "…a shared team…"; section comments mentioning "Org" updated for readers. Leave legal text ("nonprofit organization", `team.organization`) untouched — those are unrelated uses of the word.

- [ ] **Step 7: Verify build**

Run: `npm run build`
Expected: PASS (no TS errors). Then:
Run: `grep -nE "\bOrg[A-Z]|useOrgs?\b|createOrg|/org/|\borgId\b|org_id|join_org_by_invite" src/App.tsx`
Expected: no matches except intentional legacy-redirect regex `\/org\/` in Step 3.

- [ ] **Step 8: Commit**

```bash
git add src/App.tsx
git commit -m "refactor: App.tsx uses Shared Team naming, routes, redirect, create-modal default from My Team"
```

---

### Task 7: CSS class rename (independent — parallelizable)

**Files:**
- Modify: `src/styles.css`, `src/index.css`

**Interfaces:**
- Consumes: nothing at build time (class strings). Must match the JSX class strings produced in Tasks 5–6 (names fixed in the CSS class map).

- [ ] **Step 1: Rename classes** per the CSS class map across both files (`org-panel*`, `org-fav*`, `org-member*`, `join-org*`, `mobile-nav-org-badge`, `auth-menu-org*`). Add the two new classes referenced by the create modal: `.shared-team-identity-summary` and `.shared-team-override-toggle` (style to match existing `Field`/label spacing — small flex column, muted summary text).

- [ ] **Step 2: Verify**

Run: `grep -nE "org-panel|org-fav|org-member|join-org|mobile-nav-org|auth-menu-org" src/styles.css src/index.css`
Expected: no matches.

- [ ] **Step 3: Commit**

```bash
git add src/styles.css src/index.css
git commit -m "style: rename org-* CSS classes to shared-team-*"
```

---

### Task 8: Full verification sweep

**Files:** none (verification only)

- [ ] **Step 1: Build + lint**

Run: `npm run build && npm run lint`
Expected: both PASS.

- [ ] **Step 2: Global grep sweep for stragglers**

Run: `grep -rnE "\bOrg[A-Z]|useOrgs?\b|createOrg|org_id|/org/|\borgId\b|org-favorites|org-notes|org-aggregate|from \"\./orgs\"|join_org_by_invite" src/`
Expected: only the intentional legacy-redirect regex in App.tsx. Investigate anything else.
Run: `grep -rinE "\borg\b|\borgs\b" src/App.tsx src/auth.tsx | grep -iv "organization\|team.organization\|legacy\|/org/"`
Expected: no user-facing "org" copy remains.

- [ ] **Step 3: Browser preview verification** (per verification_workflow)
  - Start dev server; sign in.
  - With a My Team set: open create-shared-team → confirm "Scouting for: …" summary + checkbox; create → lands on `/shared-team/:id/settings`.
  - Toggle checkbox → program/team# fields appear pre-filled.
  - Without a My Team (or a fresh account): fields show directly, creation works with them empty.
  - Visit an old `/org/:id` URL → redirects to `/shared-team/:id`.
  - Open a shared team workspace, picklist tab loads (localStorage intact).
  - Check console + network for errors.
  - Screenshot the create modal + workspace for the user.

- [ ] **Step 4: Note DB migration is pending user action**

The code now expects the renamed schema/RPCs. Remind the user to apply `0007_rename_orgs_to_shared_teams.sql` to Supabase (staging first) before this branch is used against the live DB — until then, shared-team features will error against the old schema.

---

## Self-Review

**Spec coverage:** concept model (Task 6 modal + copy) ✓; rename term/URL (Tasks 5–7, redirect in 6) ✓; default-from-My-Team + override checkbox (Task 6 Step 5) ✓; no-My-Team case (Task 6 Step 5, `override` defaults true) ✓; DB rename incl. RLS/RPC/JSON keys (Task 1 + Task 6 Step 4) ✓; identifier `orgId→sharedTeamId`, not `teamId` (Global Constraints, all tasks) ✓; localStorage key preserved (Task 3 Step 3) ✓; verification (Task 8) ✓.

**Placeholder scan:** no TBD/TODO; all code shown; grep expectations explicit.

**Type consistency:** `SharedTeamMembership`/`SharedTeamRole`/`SharedTeamInvite`/`SharedTeamMember` used consistently; `createSharedTeam` signature `(name, program|null, number|null)` matches Task 6 call; `SharedTeamWorkspacePage` prop `sharedTeamId` matches route dispatch; RPC keys `shared_team_id`/`shared_team_name` match between Task 1 SQL and Task 6 `PeekResult`.
