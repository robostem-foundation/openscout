# My Team tabs + embedded Shared Team workspaces + timeline width

**Date:** 2026-07-19
**Status:** Approved design; pending implementation

## Problem / goal

Unify the "team" experience under `/my-team`:

1. Turn `/my-team` into a **tabbed shell**: a "My Team" tab (current dashboard) plus **one tab per shared team**, each labeled by the shared team's **number** (👥 icon), embedding that team's **full workspace**.
2. The standalone `/shared-team/:id` page is **removed** in favor of a redirect into the tab.
3. Narrow the "Season timeline" to its natural width and add a **skeleton placeholder** filling the empty space to its right (for future content).

## Decisions (from brainstorming)

- Top tabs: **My Team** (Star icon) + one per shared team, label = `teamNumber` (fallback to `name` if no number), icon = `Users`.
- Each shared-team tab embeds the **entire** workspace (7 sub-tabs: dashboard, favorites, notes, picklists, activity, export, settings).
- `/shared-team/:id` and `/shared-team/:id/settings` **redirect** to `/my-team/:id` and `/my-team/:id#settings`. Legacy `/org/:id` redirects straight to `/my-team/:id`.
- Account menu, home-panel "Manage", create-flow, and invite-join entry points all land in the tab.
- Two tab systems in one view (top tabs + workspace left-nav) is accepted and intended.

## Architecture

### Routing (`src/App.tsx` dispatcher, ~16016-16026)

- Replace exact `/my-team` match with:
  ```ts
  const myTeamMatch = path.match(/^\/my-team(?:\/([0-9a-f-]+))?$/i);
  if (myTeamMatch) return <MyTeamPage sharedTeamId={myTeamMatch[1] ?? null} />;
  ```
- Shared-team redirect (replaces the render):
  ```ts
  const stMatch = path.match(/^\/shared-team\/([0-9a-f-]+)(\/settings)?$/i);
  if (stMatch) { navigate(`/my-team/${stMatch[1]}${stMatch[2] ? "#settings" : ""}`); return null; }
  ```
- Legacy org redirect → `/my-team/${id}` (+ `#settings` when the old `/settings` suffix was present).
- `recordBreadcrumb`: match `/my-team/<id>` for the shared-team trail entry (kind `"shared-team"`); `/my-team` stays a normal page.

### Components (`src/App.tsx`)

- **Rename** current `MyTeamPage` (the dashboard body, ~15505) → `MyTeamDashboard` (unchanged content; keeps its own "Set your team" empty state).
- **Extract** `SharedTeamWorkspacePage` (~14284) inner content — the `settings-layout` (sub-nav + content) — into `SharedTeamWorkspace({ sharedTeamId })`, dropping the page chrome (`PageTitle`, "Back to home" link). Keep its `hashTab`/`replaceCurrentHash` sub-tab logic (works inside `/my-team/:id#<subtab>`). Delete the old page component.
- **New** `MyTeamPage({ sharedTeamId }: { sharedTeamId: string | null })` — the route shell:
  - `const sharedTeams = useSharedTeams();`
  - Active tab: `"my-team"` when `sharedTeamId` is null; else the matching shared team (if a member). If `sharedTeamId` is set but not a member, redirect to `/my-team`.
  - Renders a top tab bar: My Team (Star) + `sharedTeams.map(t => tab labeled t.teamNumber || t.name, Users icon)`. Clicking a tab `navigate("/my-team")` or `navigate("/my-team/<id>")`.
  - Content: `<MyTeamDashboard />` or `<SharedTeamWorkspace sharedTeamId={active.sharedTeamId} />`.
  - Page chrome (breadcrumbs/title) rendered once at the shell level.

### Nav gating (~2908, 2967, 3129)

Show the `/my-team` nav entry when `hasMyTeam || sharedTeams.length > 0` (add `useSharedTeams()` where needed). Keep label "My Team". Active state: `path === "/my-team" || path.startsWith("/my-team/")`.

### Link updates

- `auth.tsx` account menu: `/shared-team/${id}` → `/my-team/${id}`.
- `SharedTeamPanel` "Manage" (`href={/shared-team/:id/settings}`) → `/my-team/:id#settings`; mobile nav `go("/shared-team/"+id)` → `/my-team/:id`.
- `CreateSharedTeamModal`: after create, `navigate("/my-team/"+id+"#settings")`.
- (The redirect is a safety net for any missed link.)

### Timeline width + skeleton (`MyTeamDashboard` `fullTimeline`, ~15944)

Wrap the full "Season timeline" in a row with a skeleton aside:
```tsx
const fullTimeline = !liveEvent && (
  <div className="myteam-timeline-row">
    <section className="panel myteam-tl2-panel"> {/* existing content */} </section>
    <div className="myteam-timeline-aside" aria-hidden="true">
      <Skeleton className="myteam-timeline-skeleton" />
    </div>
  </div>
);
```
CSS (`src/styles.css`): `.myteam-timeline-row { display:flex; gap:16px; align-items:stretch; }`; `.myteam-tl2-panel { flex:0 0 auto; width:100%; max-width:460px; }`; `.myteam-timeline-aside { flex:1 1 0; min-width:0; }` with a dashed placeholder box (`.myteam-timeline-skeleton { height:100%; min-height:200px; border-radius:var(--radius); }`). On narrow viewports (≤900px) stack to column and hide/relax the aside. Only the non-live `fullTimeline` changes; the live `liveTimeline` (shown beside matches) is untouched.

### Tab bar styling (`src/styles.css`)

New `.myteam-tabs` horizontal tab bar (reuse the visual language of the existing `settings-tabs`/nav; horizontal, with icon+label, active underline/pill). Add `.myteam-tab`, `.myteam-tab.active`.

## Edge cases

- Shared teams but no profile team: My Team nav shows; "My Team" tab renders the "Set your team" prompt; shared-team tabs work.
- No shared teams: single "My Team" tab (tab bar may render with just one tab, or hide the bar — hide when only one tab for cleanliness).
- `/my-team/<id>` for a team you're not a member of (or `sharedTeams` not yet loaded): while `!useSharedTeamsReady()` show a loading state; once ready, if not found, redirect to `/my-team`.
- Deep link `/my-team/<id>#notes` selects the team tab + the notes sub-tab.

## Verification

- `npm run build` + `npm run lint` (lint baseline unchanged).
- Browser (needs sign-in for shared tabs): My Team tab renders; shared-team tab shows full workspace; sub-tabs work; `/shared-team/:id` redirects to `/my-team/:id`; `/org/:id` → `/my-team/:id`; account-menu entry lands in tab; timeline narrowed with skeleton aside; responsive stack.
- Route-level (no auth): `/shared-team/<uuid>` → `/my-team/<uuid>` redirect.

## Risks

- App.tsx is a single ~16k-line file; this refactor (extract + shell + routing) is a coupled sequential edit — not parallelizable across agents. Independent parallel pieces: `auth.tsx` link change and `styles.css` additions.
- Extracting the workspace must preserve the hash sub-tab behavior; verify sub-tab deep links still work.
