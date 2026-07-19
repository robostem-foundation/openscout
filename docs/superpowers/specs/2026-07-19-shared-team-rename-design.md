# Org → Shared Team: rename & reframe design

**Date:** 2026-07-19
**Status:** Approved concept; pending spec review

## Problem

The app has two overlapping concepts that confuse users:

1. **"Org"** — a cloud collaboration group (members, roles, invite links, shared
   favorites / match notes / picklists). It *optionally* carries a single
   `team_program` + `team_number`. Framed as "Collaborate with your scouting team."
2. **"My Team"** — a solo dashboard derived purely from the user's profile
   (`profile.team_number` + `team_program`): live events, matches, season.

Three specific pains:

- **Word collision.** In real VEX, an *Organization* is a school/club that fields
  *multiple* teams (169A/169B/169W). The app's "Org" is the opposite scale — a
  collaboration group that usually maps to **one** team.
- **Duplicated identity.** A team identity lives in two places (your profile *and*
  an Org's optional team fields) with no clear authority.
- **Inconsistent labels.** The same panel is variously "Your Org", "Org / Team",
  and "Create an org".

## Goal (approved direction)

Combines "rename/reframe" + the "merge" spirit:

- Keep **My Team** exactly as-is (solo, profile-derived dashboard).
- Rename **"Org" → "Shared Team"** everywhere, reframed as "you + teammates
  scouting together."
- Kill the duplicated identity by having a Shared Team **default its
  program + team # from My Team** on creation, with an override for the case
  where the shared team scouts for a different team.
- Rename scope: **Everything** — user-facing copy, URLs, code identifiers, and
  the database (tables, columns, RLS policies, helper fn, RPCs).

Explicitly **out of scope:** modeling real multi-team VEX organizations
(one org → many teams). Not doing that now.

## Concept model (approved)

| | **My Team** | **Shared Team** (was "Org") |
|---|---|---|
| What | *Your* team, from your profile | You + teammates scouting together |
| Identity source | `profile.team_number` + `team_program` | Own row; **defaults from My Team** on create |
| Membership | Just you | owner / admin / member + invite links |
| Data | Personal dashboard (events, matches, season) | Shared favorites, match notes, picklists |
| Count | Exactly one | Zero or more |

"My Team" answers *"who am I?"*; "Shared Team" answers *"who am I scouting
with?"* — and by default the second inherits the first.

## Naming decisions

- **User-facing term:** "Shared Team". Verbs: "Create a shared team", "Join a
  shared team", panel title "Shared Team".
- **URL:** `/shared-team/:id` and `/shared-team/:id/settings`.
  - ⚠️ Cannot use `/team/:id` — already the VEX team route
    (`/^\/teams?\/(.+)$/`). Using it would collide.
  - `/org/:id` and `/org/:id/settings` **redirect** to the new paths (301-style
    client redirect) so existing links/bookmarks survive.
  - `/join/:token` path is unchanged (it is not "org"-named).
- **Code identifier:** `orgId → sharedTeamId`.
  - ⚠️ Do **not** rename to `teamId` — `teamId` already means a *VEX RobotEvents
    team id* throughout the app (e.g. `CompareTeamLink`, picklist rows). Reusing
    it would be a semantic collision.
- **DB tables:** `orgs → shared_teams`, `org_members → shared_team_members`,
  `org_invites → shared_team_invites`, `org_favorites → shared_team_favorites`,
  `org_match_notes → shared_team_match_notes`, `org_picklists → shared_team_picklists`.
- **DB columns:** `org_id → shared_team_id` on every child table.
- **Helper fn:** `is_org_member → is_shared_team_member`.
- **RPCs:** `join_org_by_invite → join_shared_team_by_invite`. `peek_invite`
  keeps its name (not "org"-named) but its body + JSON keys change.
- **RPC JSON keys:** `org_id → shared_team_id`, `org_name → shared_team_name` in
  the return objects of `peek_invite` / `join_shared_team_by_invite`. Client
  `PeekResult` type and the join handler update in lockstep.

## Create Shared Team — flow (approved UX)

Modal title: **"Create a shared team"**.

- **Name** — free text (unchanged), placeholder e.g. `169W Scouting`.
- **Team identity** defaults from My Team:
  - If the user **has** a My Team: show a read-only summary line
    (`Scouting for: VRC 169W`) plus a checkbox
    **"This shared team scouts for a different team"**. Checking it reveals the
    editable Program + Team # fields (pre-filled with the My Team values so the
    user edits rather than retypes).
  - If the user has **no** My Team: no summary line; show the optional
    Program + Team # fields directly (matches today's nullable behavior — a
    Shared Team may have no team identity).
- On create, program + team # are persisted to the `shared_teams` row exactly as
  today (`createSharedTeam(name, program, teamNumber)`).

## Data migration

Existing data is preserved via in-place renames (no drop/recreate, no data loss):

- New migration `supabase/migrations/0007_rename_orgs_to_shared_teams.sql`:
  - `ALTER TABLE ... RENAME TO ...` for all 6 tables.
  - `ALTER TABLE ... RENAME COLUMN org_id TO shared_team_id` on child tables.
  - Rename PK / FK / index names for consistency (e.g.
    `org_members_user_id_idx → shared_team_members_user_id_idx`).
  - `DROP POLICY` (old names) + `CREATE POLICY` (new names) referencing renamed
    tables/columns/fn.
  - `CREATE OR REPLACE FUNCTION is_shared_team_member(...)`; drop
    `is_org_member` after policies stop referencing it.
  - `CREATE OR REPLACE` the two RPCs with renamed tables/columns and new JSON
    return keys; drop the old `join_org_by_invite`.
- Migration is **written but not auto-applied**. Applying it to the live
  Supabase project is the user's action (SQL editor / Management API), done in
  one transaction, because it is hard to reverse and touches production data.
- Old migrations `0003`–`0006` are left untouched (they represent history that
  was already applied); `0007` is the forward migration.

## localStorage

- Picklist device-local keys are `picklist:{sharedTeamId-UUID}:{eventId}`. The
  UUID value is unchanged by this rename, so **keys stay valid** — do not change
  the literal `"picklist:"` prefix. No client-side data migration needed.

## Affected code (surface map)

- **Modules to rename** (file + internal symbols): `src/orgs.ts →
  src/shared-teams.ts`, `src/org-favorites.ts → src/shared-team-favorites.ts`,
  `src/org-notes.ts → src/shared-team-notes.ts`, `src/org-aggregate.ts →
  src/shared-team-aggregate.ts`.
- **`src/picklist.ts`** — keep filename; rename internal `orgId` params →
  `sharedTeamId`, and `.from("org_picklists")` → `.from("shared_team_picklists")`,
  `eq("org_id", …)` → `eq("shared_team_id", …)`, `onConflict` strings.
- **`src/App.tsx`** — the bulk. User-facing copy, route parsing + dispatch
  (`orgMatch`, add redirect), `navigate("/org/…")` call sites, `PeekResult`
  type + join handler JSON keys, component names
  (`CreateOrgModal → CreateSharedTeamModal`, `OrgPanel → SharedTeamPanel`,
  `JoinOrgPage → JoinSharedTeamPage`, `OrgWorkspacePage → SharedTeamWorkspacePage`,
  `OrgSettings*` → `SharedTeamSettings*`), imported symbols from renamed modules,
  and the create-modal UX changes above.
- **Types:** `OrgRole → SharedTeamRole`, `OrgMembership → SharedTeamMembership`,
  `OrgInvite → SharedTeamInvite`, `OrgMember → SharedTeamMember`. Exported fns:
  `createOrg → createSharedTeam`, `useOrgs → useSharedTeams`,
  `useOrg → useSharedTeam`, `useOrgsReady → useSharedTeamsReady`,
  `leaveOrg → leaveSharedTeam`, `deleteOrg → deleteSharedTeam`,
  `updateOrg → updateSharedTeam`, `getOrgInvites → getSharedTeamInvites`,
  `getOrgMembers → getSharedTeamMembers`, `reloadOrgs → reloadSharedTeams`.
- **CSS:** class names `org-panel`, `org-fav-*`, `org-member-*`, `join-org-*`,
  `mobile-nav-org-badge`, etc. in `src/styles.css` / `src/index.css` renamed to
  `shared-team-*` for consistency (cosmetic; must stay in sync with JSX).
- **Docs:** existing spec files referencing "org" are historical — left as-is.

## Verification

- `tsc` / `vite build` must pass (no dangling `Org*` / `orgId` references except
  the intentionally-preserved VEX `teamId`).
- `grep -ri "\borg\b"` sweep over `src/` to catch stray user-facing copy.
- Manual preview: create a shared team (with and without a My Team set), invite
  flow copy, `/org/:id` redirect to `/shared-team/:id`, picklist still loads.
- DB migration validated in a Supabase branch/staging before prod (user-run).

## Risks / edge cases

- **Biggest risk is the DB layer.** RPC JSON key renames must land in lockstep
  with client reads or the join/peek flow breaks. Mitigation: migration + client
  change reviewed together; migration applied only after code is merged/ready.
- **App.tsx is a single ~16k-line file** — org references there cannot be
  parallelized across agents (write conflicts). This part is a careful
  sequential pass.
- **Route redirect** must run before NotFound so old `/org/:id` links resolve.
- **No My Team** case in the create modal must not crash (fields optional).
