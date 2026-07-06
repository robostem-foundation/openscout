# Team Quick View: Bottom Sheet Redesign

**Date:** 2026-07-06
**Status:** Approved

## Problem

The event team quick view (`TeamQuickView` in `src/App.tsx`) has three issues:

1. **Unpredictable position.** It opens as a full-height side drawer on the left
   or right depending on which half of the screen the cursor was on
   (`quickViewSideFromEvent`), and it covers page content underneath.
2. **Cramped stats.** The 420px-wide panel forces two 4-across stat-card rows
   with compacted padding overrides.
3. **Too much content.** It stacks event stats, a match table, full season stats
   (`TeamAboutTab`), an Events list, and an Awards list — far more than a
   "quick look" needs.

## Design

### Positioning: bottom sheet (desktop, >820px)

Replace the left/right drawer with a single predictable placement:

- Slides up from the bottom edge, horizontally centered.
- `width: min(720px, calc(100vw - 32px))`, `max-height: 44vh`.
- Rounded top corners, 1px `var(--border)` border, flat `var(--surface)`
  background (Geist: border over shadow).
- Non-blocking, as today: no backdrop, `pointer-events: none` on the overlay,
  page behind stays scrollable and clickable.
- Open/close animation: `translateY` slide (reusing the existing
  `mounted`/`.open` transition pattern).
- Close behaviors unchanged: Esc, × button, click outside (via overlay click
  in modal mode / existing handlers), and any navigation.

**Narrow screens (≤820px):** keep the existing centered-modal behavior
(scrim, blur, scale-in, body scroll lock) unchanged.

**Compare tray:** the tray is also bottom-centered at `z-index: 500`; the sheet
(`z-index: 550`) layers above it while open. Accepted — the sheet is transient
and closing it reveals the tray.

### Content: quick look only

**Keep:**

- Header: team number · team name, Esc hint, close button. Fold the meta line
  (program badge, location, grade) into/next to the header area.
- Action row: "Open full team view" (primary), Compare, picklist button.
- Event section for the event the view was opened from:
  - Rank stat tiles (Rank / Record / WP / AP, or IQ: Rank / Avg / High / Low).
  - Skills tiles (Skills Rank / Driver / Prog / Combined).
  - Qual-score sparkline + OPR label.
  - Match table (`TeamMatchTable`), scrollable within the sheet body.

**Remove entirely** (reachable via "Open full team view"):

- Season stats (`TeamAboutTab` block) and the season-stats section title.
- Events list (`Panel` with `quick-view-events`).
- Awards list (`TeamAwardsByEvent`).
- The `.quick-view-panel .about-*` compaction CSS overrides, which only served
  the removed `TeamAboutTab`.
- Queries that only fed removed sections — at minimum `awardsQ`. `eventsQ`,
  `rankingsQ`, `skillsQ`, `matchesQ` stay (they feed season resolution and the
  event section), but any derived values used only by removed sections
  (`seasonEvents`, `latestSeason` label plumbing where unused) are pruned.

### Layout: fixing the clutter

- At ~720px wide, render the rank + skills tiles as one row of 8 tiles,
  wrapping to 4+4 when the sheet narrows. Drop the compacted padding
  overrides; tiles use their normal `EventStatCard` spacing.
- Sparkline + OPR sits beside or directly under the tile row with normal gaps.
- Match table spans the full sheet width.
- Body padding uses existing spacing tokens — no new spacing values.

### Code changes

- `QuickViewState`: remove the `side` field. Delete `quickViewSideFromEvent`
  and the `side:` arguments at both `openQuickView` call sites
  (`useTeamLinkProps` handler and `TeamQuickLink`).
- `TeamQuickView` JSX: apply the content removals above.
- CSS: rework `.quick-view-panel` to the bottom-sheet layout; delete
  `.side-left` / `.side-right` rules; keep the ≤820px modal block.
- Settings: the "expand extras" toggle (`quickViewExpandExtras` /
  `setQuickViewExpandExtras` in `src/settings.ts`, plus its tile in the
  settings page and `useQuickViewExpandExtras` consumers) is removed — the
  sections it controlled no longer exist. Existing persisted values are simply
  ignored (no migration needed).

### Out of scope

- No drag-to-expand/resize affordance (YAGNI; "Open full team view" covers
  wanting more).
- No changes to spotlight, compare tray, or full team pages.

## Testing

- Manual: open quick view from event rankings/matches lists at various cursor
  positions → sheet always opens bottom-center; page behind remains
  interactive; Esc/×/navigation close it; light + dark themes; ≤820px modal
  unchanged; IQ event (Avg/High/Low tiles) and V5 event (Record/WP/AP) both
  render; team with no matches shows the empty state.
- `npm run build` / lint pass with the removed setting and state field.
