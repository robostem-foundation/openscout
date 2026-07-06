# Team Quick View Bottom Sheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the left/right team quick-view drawer with a predictable bottom-center sheet showing only event stats + matches, with comfortable spacing.

**Architecture:** All UI lives in `src/App.tsx` (single-file app) with global CSS in `src/styles.css` and synced settings in `src/settings.ts`. The quick view is the `TeamQuickView` component + module-level `openQuickView` store. Changes are: drop the `side` state, restyle the panel as a bottom sheet, delete the season-stats/events/awards sections and the now-dead "expand extras" setting, and re-lay-out the stat tiles for the wide-short shape.

**Tech Stack:** React 18 + TypeScript (Vite), plain CSS with custom properties (Geist-style tokens). No test runner exists in this repo — verification is `npm run build` (tsc + vite), `npm run lint`, and manual browser checks.

**Spec:** `docs/superpowers/specs/2026-07-06-team-quick-view-bottom-sheet-design.md`

## Global Constraints

- Follow Geist / existing app conventions: 1px `var(--border)` borders, flat `var(--surface)` backgrounds, no new shadows, existing CSS variables only (see `.claude/skills/geist-ui`).
- Desktop (>820px): sheet is non-blocking — overlay keeps `pointer-events: none`, no scrim, page behind stays interactive.
- ≤820px keeps the existing centered-modal behavior (scrim, blur, scale-in, body scroll lock).
- Sheet dimensions: `width: min(720px, calc(100vw - 32px))`, `max-height: 44vh`, rounded top corners only.
- Esc, × button, and navigation still close the panel; ≤820px backdrop click still closes.
- Both themes must work (all colors via existing variables).

---

### Task 1: Remove side-picking; convert the panel to a bottom sheet

**Files:**
- Modify: `src/App.tsx` (QuickViewState ~line 252, `quickViewSideFromEvent` ~line 269, two `openQuickView` call sites ~lines 2048 and 2099, `<aside>` className ~line 7774)
- Modify: `src/styles.css` (`.quick-view-panel` block ~lines 8197–8225, ≤820px media block ~lines 8475–8500)

**Interfaces:**
- Consumes: existing `openQuickView(payload)` module store.
- Produces: `QuickViewState` without a `side` field; `openQuickView({ teamId?, teamNumber, programCode?, teamName? })` — Tasks 2–4 render inside the same `TeamQuickView`.

- [ ] **Step 1: Drop `side` from the quick-view state**

In `src/App.tsx`, remove the `side` field from `QuickViewState`:

```ts
type QuickViewState = {
  // Optional: some entry points (e.g. alliance seed lists) only know the team
  // number + program, so the panel resolves the id by lookup when it's absent.
  teamId?: number;
  teamNumber: string;
  programCode?: string;
  teamName?: string | null;
} | null;
```

Delete the `quickViewSideFromEvent` function and its comment entirely (currently lines 269–273):

```ts
// DELETE THESE LINES:
// Choose the drawer side from the click position so the panel doesn't cover what
// you just clicked (left half → left drawer, right half → right drawer).
function quickViewSideFromEvent(e: { clientX: number }): "left" | "right" {
  return e.clientX < window.innerWidth / 2 ? "left" : "right";
}
```

- [ ] **Step 2: Update both `openQuickView` call sites**

There are exactly two (in `CompareTeamLink`'s non-compare branch ~line 2048, and in `TeamQuickLink` ~line 2099). Both become:

```ts
openQuickView({ teamId, teamNumber, programCode, teamName });
```

- [ ] **Step 3: Update the panel element's className**

In `TeamQuickView` (~line 7774), the `<aside>` no longer varies by side:

```tsx
<aside
  className={`quick-view-panel${mounted ? " open" : ""}`}
  role="dialog"
  aria-modal="true"
  aria-label={`Quick view for team ${state.teamNumber}`}
  onClick={(e) => e.stopPropagation()}
>
```

- [ ] **Step 4: Replace the drawer CSS with bottom-sheet CSS**

In `src/styles.css`, replace the `.quick-view-panel`, `.quick-view-panel.side-right`, `.quick-view-panel.side-left`, and `.quick-view-panel.open` rules (lines 8197–8225) with:

```css
.quick-view-panel {
  position: fixed;
  bottom: 0;
  left: 50%;
  width: min(720px, calc(100vw - 32px));
  max-height: 44vh;
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border: 1px solid var(--border);
  border-bottom: none;
  border-radius: var(--radius) var(--radius) 0 0;
  overflow: hidden;
  transform: translateX(-50%) translateY(100%);
  transition: transform 0.22s ease;
  pointer-events: auto; /* the panel itself stays interactive */
}

.quick-view-panel.open {
  transform: translateX(-50%) translateY(0);
}
```

Notes: `top: 50px` and `box-shadow: var(--shadow-md)` are gone (bottom-anchored; Geist prefers the border). The `.quick-view-overlay` rule above it is unchanged.

- [ ] **Step 5: Simplify the ≤820px media block selectors**

The media block (~lines 8475–8500) currently targets `.quick-view-panel, .quick-view-panel.side-left, .quick-view-panel.side-right`. The side classes no longer exist; the modal also needs its full border/radius back. Replace the panel rules inside `@media (max-width: 820px)` with:

```css
  .quick-view-panel {
    top: 50%;
    left: 50%;
    right: auto;
    bottom: auto;
    width: min(560px, 94vw);
    max-height: 88vh;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    transform: translate(-50%, -50%) scale(0.96);
  }
  .quick-view-panel.open {
    transform: translate(-50%, -50%) scale(1);
  }
```

(The `.quick-view-overlay` scrim rule in the same block is unchanged.)

- [ ] **Step 6: Verify build and lint**

Run: `npm run build && npm run lint`
Expected: both succeed. `tsc` will catch any leftover reference to `state.side` or `quickViewSideFromEvent`.

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx src/styles.css
git commit -m "Quick view: always open as a bottom-center sheet (drop side-picking)"
```

---

### Task 2: Trim the quick view to event stats + matches; fold meta into the header

**Files:**
- Modify: `src/App.tsx` (`TeamQuickView` body, ~lines 7600–7912)
- Modify: `src/styles.css` (delete `.quick-view-body > .panel`, `.quick-view-events*`, and `.quick-view-panel .about-*` rules; add `.quick-view-heading`; adjust `.quick-view-meta`)

**Interfaces:**
- Consumes: `QuickViewState` from Task 1.
- Produces: a `TeamQuickView` whose body renders only the event section (stat rows, sparkline, match table). Task 3 removes the setting this task stops consuming; Task 4 restyles the stat rows this task leaves in place.

- [ ] **Step 1: Remove dead data plumbing in `TeamQuickView`**

Delete these from the component:

```ts
// DELETE — Events/Awards sections are gone:
const expandExtras = useQuickViewExpandExtras();

// DELETE — awards were only shown in the removed Awards section:
const awardsQ = useAsync(
  async () => (teamId != null && seasonId ? (await collectAllPages<Award>((page) => api.teamAwards(teamId, { "season[]": [seasonId], per_page: 250, page }))).data : []),
  [teamId, seasonId],
);

// DELETE — only fed the removed Events panel:
const seasonEvents = useMemo(
  () => teamEvents.filter((ev) => !seasonId || ev.season.id === seasonId).sort(compareEventsByDirection("asc")),
  [teamEvents, seasonId],
);
```

Keep `eventsQ`, `latestSeason`, `seasonLabel`, `rankingsQ`, `skillsQ`, `matchesQ` — they resolve the season and feed the event section. Keep `aboutLoading`? No — it was only passed to `TeamAboutTab`; delete this line too:

```ts
// DELETE:
const aboutLoading = eventsQ.loading || rankingsQ.loading || skillsQ.loading || matchesQ.loading;
```

- [ ] **Step 2: Fold the meta line into the header**

Replace the current header (~lines 7780–7789) with a two-line heading; the meta row moves up from the body:

```tsx
<div className="quick-view-header">
  <div className="quick-view-heading">
    <div className="quick-view-title">
      <strong>{state.teamNumber}</strong>
      {(team?.team_name ?? state.teamName) && <span> · {team?.team_name ?? state.teamName}</span>}
    </div>
    {team && (
      <div className="quick-view-meta">
        <ProgramBadge program={team.program} />
        <span>{locationLine(team)}</span>
        <span>{team.grade ?? "Grade unknown"}</span>
      </div>
    )}
  </div>
  <span className="close-btn-wrap">
    <kbd className="esc-hint">Esc</kbd>
    <button ref={closeRef} type="button" className="video-close-btn" onClick={onClose} aria-label="Close quick view">×</button>
  </span>
</div>
```

(`ProgramBadge` takes `program` as a prop, so it works outside the body's `ProgramContext.Provider`.)

- [ ] **Step 3: Trim the body to the event section only**

Inside `quick-view-body`, delete the old meta `<div className="quick-view-meta">…</div>` block (now in the header) and everything after the closing `</section>` of `quick-view-event` up to (not including) the closing `</>` of the fragment — i.e. remove:

- the `<div className="quick-view-section-title">Season stats…</div>` line,
- the entire `<TeamAboutTab … compact />` element,
- the entire `<Panel title={`Events …`} …>…</Panel>` element,
- the entire `<TeamAwardsByEvent … />` element.

The body becomes:

```tsx
<div className="quick-view-body">
  {teamQ.loading ? (
    <Status loading={true} error={null} />
  ) : !team ? (
    <div className="empty">Team not found.</div>
  ) : (
    <ProgramContext.Provider value={programCode}>
      {seasonId == null ? (
        <div className="empty">No season data for this team yet.</div>
      ) : contextEventId != null ? (
        <section className="quick-view-event">
          {contextEvent && <div className="quick-view-event-title">{contextEvent.name}</div>}
          <div className="quick-view-stat-row">
            {rankRow.map((c) => <EventStatCard key={c.label} label={c.label} value={eventLoading ? "…" : c.value} />)}
          </div>
          {!matchesQ.loading && (qualScores.length > 1 || evtOpr != null) && (
            <div className="quick-view-spark">
              {qualScores.length > 1 && (
                <div className="quick-view-spark-chart"><ScoreSparkline values={qualScores} /></div>
              )}
              <span className="quick-view-spark-label">
                Qual scores
                {evtOpr != null && <> · <strong>OPR {evtOpr.toFixed(1)}</strong></>}
              </span>
            </div>
          )}
          <div className="quick-view-stat-row">
            {skillsRow.map((c) => <EventStatCard key={c.label} label={c.label} value={skillsQ.loading ? "…" : c.value} />)}
          </div>
          <div className="quick-view-section-title">
            Matches
            {teamDivision && <span className="quick-view-division">{teamDivision}</span>}
          </div>
          {matchesQ.loading ? (
            <div className="empty">Loading matches…</div>
          ) : eventMatches.length ? (
            <TeamMatchTable matches={eventMatches} focusTeamId={team.id} isIq={isIq} hideDivision />
          ) : (
            <div className="empty">No matches for this team at this event.</div>
          )}
        </section>
      ) : (
        <div className="empty">Open this from an event to see event stats.</div>
      )}
    </ProgramContext.Provider>
  )}
</div>
```

(The quick view only opens when `_currentEventId != null`, so the last branch is a defensive fallback, not a real state. Task 4 renames the two `quick-view-stat-row` divs.)

- [ ] **Step 4: Update the CSS**

In `src/styles.css`:

Add after the `.close-btn-wrap` rule, and change `.quick-view-meta`'s margin (it no longer needs body spacing):

```css
.quick-view-heading {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
```

```css
.quick-view-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  color: var(--text-muted);
  font-size: 13px;
}
```

Delete these now-dead rules:

- `.quick-view-body > .panel { margin-top: 14px; }` (and its comment) — no panels left in the body.
- `.quick-view-events`, `.quick-view-events li`, `.quick-view-events li:last-child`, `.quick-view-event-name`, `.quick-view-event-sub` (~lines 8410–8435).
- The entire "Compact the reused team-About cards/charts…" block: every `.quick-view-panel .about-*` rule (~lines 8437–8473).

- [ ] **Step 5: Verify build and lint**

Run: `npm run build && npm run lint`
Expected: both succeed. Lint's unused-vars rule will catch any leftover of `awardsQ` / `seasonEvents` / `aboutLoading` / `expandExtras`. Note: `TeamAboutTab`, `TeamAwardsByEvent`, `Panel`, `CalendarDays`, `Award`, and `compareEventsByDirection` are still used by the full team page — do NOT delete their definitions/imports; only build/lint failures should prompt further removals.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/styles.css
git commit -m "Quick view: trim to event stats + matches; meta moves into header"
```

---

### Task 3: Remove the dead "Quick view sections" (expand extras) setting

**Files:**
- Modify: `src/settings.ts` (key constant, `SYNCED_KEYS`, getter/hook/setter ~lines 19–20 and 261–278)
- Modify: `src/App.tsx` (import ~line 104, `QUICK_VIEW_SECTION_OPTIONS` ~line 11884, `AppearanceSettings` tile ~lines 11907 and 11962–11980)

**Interfaces:**
- Consumes: nothing from earlier tasks (Task 2 already removed the component-side `useQuickViewExpandExtras()` call).
- Produces: `settings.ts` no longer exports `useQuickViewExpandExtras` / `setQuickViewExpandExtras`; `SYNCED_KEYS` shrinks by one. Persisted `vex-quick-view-expand-extras` values (localStorage and cloud jsonb) are simply ignored — no migration.

- [ ] **Step 1: Remove the setting from `src/settings.ts`**

Delete the key constant and remove it from `SYNCED_KEYS`:

```ts
const QUICK_VIEW_FIRST_KEY = "vex-quick-view-first";
const SYNCED_KEYS = [EVENTS_PROGRAMS_KEY, EVENTS_FILTERS_KEY, TAB_LAYOUT_KEY, QUICK_VIEW_FIRST_KEY] as const;
```

Delete the whole trailing block (comment included):

```ts
// DELETE:
// Whether the quick-view's Events & Awards sections start expanded (default
// false → collapsed). Reuses the quick-view listener set.
function getQuickViewExpandExtras(): boolean { … }
export function useQuickViewExpandExtras(): boolean { … }
export function setQuickViewExpandExtras(value: boolean) { … }
```

- [ ] **Step 2: Remove the settings UI from `src/App.tsx`**

Update the import (line 104):

```ts
import { setEventsSettings, setQuickViewFirst, useQuickViewFirst, useSettingsEpoch } from "./settings";
```

Delete the `QUICK_VIEW_SECTION_OPTIONS` constant:

```ts
// DELETE:
const QUICK_VIEW_SECTION_OPTIONS: Array<{ value: boolean; label: string }> = [
  { value: false, label: "Collapsed" },
  { value: true, label: "Expanded" },
];
```

In `AppearanceSettings`, delete the state line and the entire second `settings-field` block:

```ts
// DELETE:
const quickViewExpand = useQuickViewExpandExtras(); // quick-view Events/Awards default, synced
```

```tsx
// DELETE the whole block:
<div className="settings-field">
  <h3 className="settings-field-title">Quick view sections</h3>
  …
</div>
```

(Keep the "Team click behavior" field and `QuickViewWire` — that setting still exists.)

- [ ] **Step 3: Verify build and lint**

Run: `npm run build && npm run lint`
Expected: both succeed with no unused-export/vars warnings for the removed setting.

- [ ] **Step 4: Commit**

```bash
git add src/settings.ts src/App.tsx
git commit -m "Settings: remove quick-view expand-extras toggle (sections no longer exist)"
```

---

### Task 4: Restyle stats for the wide sheet — one 8-tile row, real padding

**Files:**
- Modify: `src/App.tsx` (`TeamQuickView` stat markup from Task 2's body)
- Modify: `src/styles.css` (`.quick-view-body` padding, replace `.quick-view-stat-row` rules with `.quick-view-stat-grid`, ≤820px column override)

**Interfaces:**
- Consumes: Task 2's body markup (two `quick-view-stat-row` divs).
- Produces: final rendered layout; class `quick-view-stat-grid` replaces `quick-view-stat-row` everywhere (`quick-view-stat-row` must have zero remaining references in both files).

- [ ] **Step 1: Merge the two stat rows into one grid**

In the `quick-view-event` section, replace the first `quick-view-stat-row` div AND the second one with a single grid holding all 8 tiles, and move the sparkline after it:

```tsx
<div className="quick-view-stat-grid">
  {rankRow.map((c) => <EventStatCard key={c.label} label={c.label} value={eventLoading ? "…" : c.value} />)}
  {skillsRow.map((c) => <EventStatCard key={c.label} label={c.label} value={skillsQ.loading ? "…" : c.value} />)}
</div>
{!matchesQ.loading && (qualScores.length > 1 || evtOpr != null) && (
  <div className="quick-view-spark">
    {qualScores.length > 1 && (
      <div className="quick-view-spark-chart"><ScoreSparkline values={qualScores} /></div>
    )}
    <span className="quick-view-spark-label">
      Qual scores
      {evtOpr != null && <> · <strong>OPR {evtOpr.toFixed(1)}</strong></>}
    </span>
  </div>
)}
```

The rank/skills tile arrays and labels are unchanged — only the container changes.

- [ ] **Step 2: Replace the stat-row CSS with a grid + breathing room**

In `src/styles.css`, update the body padding:

```css
.quick-view-body {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 14px 18px;
}
```

Replace the three `.quick-view-stat-row …` rules (~lines 8374–8408) with:

```css
/* All 8 event stat tiles in one row on the wide sheet; 4+4 in the narrow modal. */
.quick-view-stat-grid {
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 10px;
}

.quick-view-stat-grid .event-stat-card {
  min-width: 0;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-start;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.quick-view-stat-grid .event-stat-label {
  font-size: 11px;
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.quick-view-stat-grid .event-stat-value {
  font-size: 16px;
  max-width: 100%;
  white-space: nowrap; /* never split a hyphenated record like "8-4-0" */
  overflow: hidden;
  text-overflow: ellipsis;
  font-variant-numeric: tabular-nums; /* steadier numeric widths */
}
```

Inside the existing `@media (max-width: 820px)` block (with the modal rules), add:

```css
  .quick-view-stat-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
```

- [ ] **Step 3: Check for leftover references**

Run: `grep -rn "quick-view-stat-row" src/`
Expected: no output.

- [ ] **Step 4: Verify build and lint**

Run: `npm run build && npm run lint`
Expected: both succeed.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/styles.css
git commit -m "Quick view: single 8-tile stat row with restored padding for the wide sheet"
```

---

### Task 5: Manual verification in the browser

**Files:** none (verification only).

**Interfaces:**
- Consumes: the finished UI from Tasks 1–4.
- Produces: confirmation against the spec's testing checklist.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev` (serves the Vite app via `server/index.ts`; open the URL it prints).

- [ ] **Step 2: Walk the spec's manual checklist**

Open any event's rankings or matches tab and click teams on the far left, middle, and far right of the screen. Verify each:

1. The sheet always slides up bottom-center — same place every time — max ~44% of viewport height, ~720px wide, 1px border, rounded top corners, flat surface.
2. Page behind stays scrollable and clickable (desktop); Esc, ×, and clicking any link inside all close it.
3. Content is exactly: header with team number/name + program badge/location/grade, action buttons, event name, one row of 8 stat tiles, sparkline + OPR (when available), Matches table scrolling inside the sheet. No season stats, Events, or Awards sections.
4. Stat tiles read comfortably — no truncated labels at 720px, 4+4 wrap in the narrow modal.
5. Try a V5/VRC event (Rank/Record/WP/AP) and a VIQRC event (Rank/Avg/High/Low) if one is available; a team with no matches shows the empty state.
6. Resize below 820px: centered modal with scrim/blur, 4+4 stat grid, body scroll locked, backdrop click closes.
7. Toggle light/dark theme in Settings → Appearance; sheet looks right in both. Confirm the "Quick view sections" tile is gone and "Team click behavior" still works (off = navigates straight to team page).
8. With 1–3 teams in the compare tray, open the quick view: the sheet layers above the tray; closing reveals the tray again.

- [ ] **Step 3: Fix anything that fails, re-verify, and commit fixes**

Any fix commits use the message style of the tasks above.
