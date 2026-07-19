# My Team Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/my-team` a tabbed shell — a "My Team" tab plus one tab per shared team (labeled by team number) embedding each team's full workspace — redirect the old `/shared-team/:id` page into it, and narrow the Season timeline with a skeleton placeholder aside.

**Architecture:** Refactor `src/App.tsx`: rename the current `MyTeamPage` body → `MyTeamDashboard`, extract the shared-team workspace inner content → `SharedTeamWorkspace`, and add a new `MyTeamPage` shell that renders a top tab bar and the selected content. Routing gains `/my-team/:id` and redirects `/shared-team/:id` → `/my-team/:id`. `auth.tsx` and `styles.css` get small independent changes.

**Tech Stack:** React + TypeScript (Vite), single-file component tree in `src/App.tsx`.

## Global Constraints

- Tab labels: My Team tab = "My Team" (Star icon). Shared-team tabs = `teamNumber` (fallback to `name` when no number), `Users` icon.
- Route: `/my-team` = My Team tab; `/my-team/<sharedTeamId>` = that team's tab; sub-tab via existing `#hash`.
- Redirects: `/shared-team/:id` → `/my-team/:id`; `/shared-team/:id/settings` → `/my-team/:id#settings`; legacy `/org/:id[/settings]` → `/my-team/:id[#settings]`.
- Do not change `teamId`/`teamNumber` VEX semantics; `sharedTeamId` is the shared-team UUID.
- Only the non-live `fullTimeline` gets the width/skeleton change; the live `liveTimeline` is untouched.
- Verify with `npm run build` + `npm run lint` (no unit-test suite; lint baseline = 91 problems, must stay 91).

**Parallelization:** Task 1 (App.tsx) is a single coupled sequential edit — not splittable. Task 2 (`auth.tsx`) and Task 3 (`styles.css`) are independent files and run in parallel with Task 1 (edit-only, no commits by agents; coordinator commits). Build goes green only after all three land.

---

### Task 1: App.tsx — tabbed shell, workspace extraction, routing, timeline

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Produces: `MyTeamPage({ sharedTeamId: string | null })` (route shell), `MyTeamDashboard()` (former MyTeamPage body), `SharedTeamWorkspace({ sharedTeamId: string })` (former SharedTeamWorkspacePage inner content). Consumes CSS classes from Task 3 (`myteam-tabs`, `myteam-tab`, `myteam-timeline-row`, `myteam-tl2-panel`, `myteam-timeline-aside`, `myteam-timeline-skeleton`).

- [ ] **Step 1: Rename the dashboard body**

At `src/App.tsx:15505`, rename `function MyTeamPage() {` → `function MyTeamDashboard() {`. Change its outer return wrapper (`~15962`) from `<section className="page myteam-page">` to `<div className="myteam-page">` (and the matching closing `</section>` at ~15976 to `</div>`). Change each early-return page wrapper in this function — the loading guard, the "Team not found" guard (`~15691`), and the "Set your team" empty state (`~15682`) — from `<section className="page myteam-page">…</section>` / `<section className="page …">` to `<div className="myteam-page">…</div>`. (The shell provides the outer `.page`.)

- [ ] **Step 2: Extract SharedTeamWorkspace**

Rename `function SharedTeamWorkspacePage({ sharedTeamId }: { sharedTeamId: string })` (`~14284`) → `function SharedTeamWorkspace({ sharedTeamId }: { sharedTeamId: string })`. Remove its outer page chrome so it returns just the workspace body:
- Replace the not-signed-in guard body with `return <div className="myteam-state"><p style={{ color: "var(--text-muted)" }}>Sign in to view this shared team.</p></div>;`
- Replace the not-found guard body with `return <div className="myteam-state"><p style={{ color: "var(--text-muted)" }}>Shared Team not found or you are not a member.</p></div>;`
- Change the main return from `<section className="page"> <Breadcrumbs .../> <PageTitle .../> <div style={{marginBottom:12}}><a className="join-shared-team-back" …>← Back to home</a></div> <div className="settings-layout">…</div> </section>` to just `return <div className="settings-layout">…</div>;` (drop the `<section>`, `Breadcrumbs`, `PageTitle`, and the back link — the shell renders page chrome). Keep the `settings-tabs` nav + content untouched, including its `hashTab`/`replaceCurrentHash` logic.

- [ ] **Step 3: Add the MyTeamPage shell**

Insert a new `MyTeamPage` immediately before `MyTeamDashboard`:

```tsx
function MyTeamPage({ sharedTeamId }: { sharedTeamId: string | null }) {
  const sharedTeams = useSharedTeams();
  const ready = useSharedTeamsReady();
  const active = sharedTeamId ? sharedTeams.find((t) => t.sharedTeamId === sharedTeamId) : null;

  // Deep-linked to a team you're not a member of (once memberships are loaded) → home tab.
  useEffect(() => {
    if (sharedTeamId && ready && !active) navigate("/my-team");
  }, [sharedTeamId, ready, active]);

  const tabs: Array<{ id: string | null; label: string }> = [
    { id: null, label: "My Team" },
    ...sharedTeams.map((t) => ({ id: t.sharedTeamId, label: t.teamNumber || t.name })),
  ];

  return (
    <section className="page myteam-shell">
      {tabs.length > 1 && (
        <nav className="myteam-tabs" aria-label="My Team sections">
          {tabs.map((t) => {
            const isActive = (t.id ?? null) === (sharedTeamId ?? null);
            return (
              <button
                key={t.id ?? "__my"}
                type="button"
                className={`myteam-tab ${isActive ? "active" : ""}`}
                onClick={() => navigate(t.id ? `/my-team/${t.id}` : "/my-team")}
              >
                {t.id ? <Users size={15} /> : <Star size={15} />}
                {t.label}
              </button>
            );
          })}
        </nav>
      )}
      {sharedTeamId && active
        ? <SharedTeamWorkspace sharedTeamId={sharedTeamId} />
        : sharedTeamId && !ready
          ? <div className="myteam-state"><p style={{ color: "var(--text-muted)" }}>Loading…</p></div>
          : <MyTeamDashboard />}
    </section>
  );
}
```

Confirm `Star` and `Users` are already imported in App.tsx (they are — used in nav and elsewhere).

- [ ] **Step 4: Routing — /my-team/:id + redirects**

In the dispatcher, replace line `if (path === "/my-team") return <MyTeamPage />;` (`~16016`) with:
```ts
const myTeamMatch = path.match(/^\/my-team(?:\/([0-9a-f-]+))?$/i);
if (myTeamMatch) return <MyTeamPage sharedTeamId={myTeamMatch[1] ?? null} />;
```
Replace the legacy-org redirect (`~16023-16024`) with:
```ts
const legacyOrg = path.match(/^\/org\/([0-9a-f-]+)(\/settings)?$/i);
if (legacyOrg) { navigate(`/my-team/${legacyOrg[1]}${legacyOrg[2] ? "#settings" : ""}`); return null; }
```
Replace the shared-team render (`~16025-16026`) with a redirect:
```ts
const stMatch = path.match(/^\/shared-team\/([0-9a-f-]+)(\/settings)?$/i);
if (stMatch) { navigate(`/my-team/${stMatch[1]}${stMatch[2] ? "#settings" : ""}`); return null; }
```

- [ ] **Step 5: Breadcrumb trail**

In `recordBreadcrumb` (`~16049`), replace the `/shared-team/` matcher:
```ts
const myTeamTeamMatch = p.match(/^\/my-team\/([0-9a-f-]+)/i);
if (myTeamTeamMatch) return recordTrail({ path: p, kind: "shared-team", label: "Shared Team" });
```
(Leave the plain `/my-team` handling as-is / default.)

- [ ] **Step 6: Nav gating (show My Team when member of a shared team)**

At the three nav sites, add shared-teams awareness. In `MobileTabBar` (`~2900`) and the desktop sidebar (`~2938`) and the breadcrumb-nav builder (`~3118`): add `const sharedTeams = useSharedTeams();` and change the `hasMyTeam ?` gate to `(hasMyTeam || sharedTeams.length > 0) ?`, and set the entry's `active` to `path === "/my-team" || path.startsWith("/my-team/")`. Example (MobileTabBar line 2908):
```tsx
...((hasMyTeam || sharedTeams.length > 0) ? [{ href: "/my-team", label: "My Team", Icon: Star, active: path === "/my-team" || path.startsWith("/my-team/") }] : []),
```
Apply the analogous change at 2967 and 3129.

- [ ] **Step 7: Update in-App links**

- `CreateSharedTeamModal` (`~13365`): `navigate(`/shared-team/${id}/settings`)` → `navigate(`/my-team/${id}#settings`)`.
- `SharedTeamPanel` "Manage" link (`href={`/shared-team/${org.sharedTeamId}/settings`}` / `t.sharedTeamId`): → `href={`/my-team/${t.sharedTeamId}#settings`}`.
- Mobile nav `go(`/shared-team/${...}`)` (`~3030`): → `go(`/my-team/${...}`)`.

- [ ] **Step 8: Timeline width + skeleton**

Replace `MyTeamDashboard`'s `fullTimeline` (`~15944-15959`) with a row wrapping the existing panel plus a skeleton aside:
```tsx
const fullTimeline = !liveEvent && (
  <div className="myteam-timeline-row">
    <section className="panel myteam-tl2-panel">
      <h2><span className="ttl">Season timeline</span><span className="myteam-act muted-act">{timeline.length} events</span></h2>
      <div className="myteam-timeline2">
        {timeline.map((row, i) => (
          <div key={row.event.id} className={`myteam-tnode ${i % 2 ? "right" : "left"} ${row.state} ${row.isNext ? "next" : ""}`}>
            <Link href={eventPath(row.event)} className="myteam-tcard">{timelineNode(row)}</Link>
          </div>
        ))}
        {!timeline.length && <div className="myteam-upnext-empty">No events this season yet.</div>}
      </div>
      <div className="myteam-tl-legend center">
        <span><i className="nextpt" /> Next up</span><span><i className="up" /> Upcoming</span><span><i className="done" /> Completed</span>
      </div>
    </section>
    <div className="myteam-timeline-aside" aria-hidden="true">
      <Skeleton className="myteam-timeline-skeleton" />
    </div>
  </div>
);
```
Confirm `Skeleton` is already imported in App.tsx (it is — used in `SharedTeamDashboardTab`).

- [ ] **Step 9: Build**

Run: `npm run build`
Expected: PASS (will only pass once Task 3's CSS classes exist, but TS/JSX must compile regardless — class names are strings, so build is green after Steps 1–8).
Run: `grep -nE "SharedTeamWorkspacePage|path === \"/my-team\"" src/App.tsx`
Expected: no matches (old symbol/route gone).

- [ ] **Step 10: Commit**

```bash
git add src/App.tsx
git commit -m "My Team: tabbed shell with embedded shared-team workspaces + timeline skeleton aside"
```

---

### Task 2: auth.tsx — account menu links (independent — parallelizable)

**Files:**
- Modify: `src/auth.tsx`

- [ ] **Step 1: Repoint shared-team links**

Change the account-menu shared-team entry from `goTo(`/shared-team/${t.sharedTeamId}`)` to `goTo(`/my-team/${t.sharedTeamId}`)`.

- [ ] **Step 2: Verify**

Run: `grep -nE "/shared-team/" src/auth.tsx`
Expected: no matches.

- [ ] **Step 3: (coordinator commits; agent does not run git)**

---

### Task 3: styles.css — tab bar + timeline row/skeleton (independent — parallelizable)

**Files:**
- Modify: `src/styles.css`

- [ ] **Step 1: Add the My Team tab bar styles**

Add near the other `myteam-*` rules a horizontal tab bar, reusing the app's visual language (icon + label, active state). Use existing tokens (`--text`, `--text-muted`, `--accent`, `--border`, `--surface`, `--radius`):
```css
.myteam-tabs { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 16px; border-bottom: 1px solid var(--border); }
.myteam-tab { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; background: none; border: none; border-bottom: 2px solid transparent; color: var(--text-muted); font-size: 14px; font-weight: 600; cursor: pointer; }
.myteam-tab:hover { color: var(--text); }
.myteam-tab.active { color: var(--text); border-bottom-color: var(--accent); }
```

- [ ] **Step 2: Add the timeline row + skeleton aside**

```css
.myteam-timeline-row { display: flex; gap: 16px; align-items: stretch; }
.myteam-timeline-row .myteam-tl2-panel { flex: 0 0 auto; width: 100%; max-width: 460px; }
.myteam-timeline-aside { flex: 1 1 0; min-width: 0; }
.myteam-timeline-skeleton { height: 100%; width: 100%; min-height: 220px; border-radius: var(--radius); }
@media (max-width: 900px) {
  .myteam-timeline-row { flex-direction: column; }
  .myteam-timeline-row .myteam-tl2-panel { max-width: none; }
  .myteam-timeline-aside { display: none; }
}
```

- [ ] **Step 3: Verify**

Run: `grep -nE "myteam-tabs|myteam-timeline-row|myteam-timeline-aside|myteam-timeline-skeleton" src/styles.css`
Expected: matches for all four.

- [ ] **Step 4: (coordinator commits; agent does not run git)**

---

### Task 4: Integration verification (coordinator)

**Files:** none

- [ ] **Step 1: Build + lint**

Run: `npm run build && npm run lint`
Expected: build PASS; lint `✖ 91 problems` (unchanged baseline).

- [ ] **Step 2: Route-level browser check (no auth needed)**

Start dev server; navigate `/shared-team/<uuid>` → expect redirect to `/my-team/<uuid>`; `/org/<uuid>` → `/my-team/<uuid>`. Load `/my-team` (signed out) → "Set your team" prompt renders inside the shell.

- [ ] **Step 3: Signed-in check (report as limitation if unavailable)**

If a session is available: My Team tab + one tab per shared team (labeled by number, Users icon); selecting a shared tab shows the full workspace; `#notes` deep link selects the sub-tab; account-menu entry lands in the tab; timeline narrowed with skeleton aside; resize < 900px stacks and hides the aside. Screenshot for the user.

---

## Self-Review

**Spec coverage:** tabbed shell (Task 1 Step 3) ✓; per-shared-team tab labeled by number + Users icon (Step 3) ✓; embed full workspace (Steps 2–3) ✓; `/my-team/:id` route + redirects incl. legacy org (Step 4) ✓; breadcrumb (Step 5) ✓; nav gating with shared teams (Step 6) ✓; link updates incl. account menu (Task 2) + panel/create (Step 7) ✓; remove standalone page (Steps 2, 4) ✓; timeline width + skeleton (Step 8 + Task 3 Step 2) ✓; edge cases loading/not-member (Step 3), no-profile-team (Step 1 guards render in shell), single-tab hides bar (Step 3 `tabs.length > 1`) ✓; verification (Task 4) ✓.

**Placeholder scan:** none; all code shown; grep expectations explicit.

**Type consistency:** `MyTeamPage({ sharedTeamId: string | null })` matches the dispatcher call `sharedTeamId={myTeamMatch[1] ?? null}`; `SharedTeamWorkspace({ sharedTeamId: string })` matches shell usage; membership field `sharedTeamId`/`teamNumber`/`name` match the `SharedTeamMembership` type from the prior rename; class names in Task 1 match Task 3 definitions.
