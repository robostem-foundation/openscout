# Motion Polish Pass (Framer Motion, targeted) — Design

**Date:** 2026-07-21
**Status:** Approved (pending spec review)

## Goal

Add subtle, cohesive motion polish across the OpenScout app, drawing on the
feel of [beUI](https://beui.dev/) (spring-based physics) without importing beUI
itself. Motion should feel alive but restrained — the app is a data-dense VEX
scouting tool, not a marketing site.

Priorities chosen with the user:

1. **Overlays & transitions** (dialogs, sheets, popovers, dropdowns, mobile nav
   drawer) — targeted, not a full rewrite.
2. **Loading & skeletons** (shimmer, loading→loaded transitions, empty-state
   entrances).

Explicitly **out of scope** for this pass (YAGNI — may revisit later):
interactive-feedback layer (button/toggle springs), list stagger / reorder /
count-ups, and full conversion of every Radix overlay to Framer.

## Context / current state

- App is a single ~16.5k-line file: `src/App.tsx`. shadcn/ui (new-york) lives
  in `src/components/ui/*`, built on Radix + Tailwind v4 + `tw-animate-css`.
- **Reduced motion is already respected** throughout: `prefers-reduced-motion`
  guards in `src/styles.css` (multiple `@media` blocks) and inside the custom
  `CrossFade` component (`src/App.tsx:3179`). New motion MUST preserve this.
- shadcn overlays (`dialog.tsx`, `sheet.tsx`, `popover.tsx`,
  `dropdown-menu.tsx`) already animate via Radix `data-state` +
  `tw-animate-css` (fade / zoom). They are NOT starting from zero.
- `MobileNavDrawer` (`src/App.tsx:3038`) is a hand-rolled CSS-class drawer
  (`.mobile-nav-drawer` / `.mobile-nav-scrim` in `styles.css`), toggled by an
  `open` prop. It has body-scroll lock, focus management, and Escape handling.
- `CrossFade` (`src/App.tsx:3179`) uses raw WAAPI and is robust against rapid
  re-triggers. Leave it alone.
- `Skeleton` (`src/components/ui/skeleton.tsx`) uses `animate-pulse`. A
  `shimmer` keyframe already exists in `styles.css:3014`.

## New dependency

- `motion` (Framer Motion). This is the **only** new runtime dependency
  (~30–50 KB gzipped). No other animation libraries.

## Design

### 1. Motion foundation — shared toolkit

New module `src/lib/motion.ts` centralizes motion tokens so nothing is defined
ad-hoc inline:

- **Spring presets** tuned to a beUI-like feel:
  - `springSnappy` — quick, low-overshoot (reserved for future interactive layer).
  - `springSmooth` — overlays / drawers.
  - `springGentle` — content and empty-state reveals.
- **Variant sets** (Framer `Variants` objects):
  - `fade`, `fadeScale` (dialog enter/exit feel),
  - `slideInRight` / `slideInLeft` (drawers / sheets),
  - `revealUp` (content + empty-state entrances).
- Durations/eases exported as named constants; no magic numbers at call sites.

**Reduced motion:** wrap the app root (in `src/App.tsx`, at the top-level
`Layout`/app shell) in `<MotionConfig reducedMotion="user">`. Every Framer
animation then automatically degrades to opacity-only / instant when the OS
requests reduced motion — matching existing behavior with no per-component work.

### 2. Overlays — targeted

- **`MobileNavDrawer`**: convert to `AnimatePresence` + `motion.div`.
  - Scrim: fade in/out.
  - Panel: spring slide-in (`springSmooth`) using `slideInLeft`/`slideInRight`
    per its current side.
  - Add **drag-to-close** on the panel (drag toward the closed edge past a
    threshold → `onClose`).
  - Preserve ALL existing behavior: body-scroll lock, focus move into panel,
    Escape-to-close, `aria-*` attributes.
- **Radix overlays** (`dialog`, `sheet`, `popover`, `dropdown-menu`): **no
  structural change.** Retune their `tw-animate-css` enter/exit keyframes to a
  springier beUI feel (subtle scale overshoot on enter, softer exit). Done once
  via the ui component classNames / shared keyframes; Radix mount logic (used in
  dozens of places) is untouched.
- **`CrossFade`**: leave as-is.

### 3. Loading & skeletons

- **`Skeleton`**: add a shimmer sweep using the existing `shimmer` keyframe;
  fall back to the current static/pulse under reduced motion.
- **`<LoadingSwap>`** — new small helper (`AnimatePresence`) that crossfades a
  skeleton out and content in with `revealUp`, so data never pops in abruptly.
  Wraps the existing `Status` / `LoadingTable` loading pattern.
- **`Empty`** (`src/App.tsx:2177`): gentle entrance (`revealUp`) so empty states
  settle in.

### 4. Rollout order

- **Phase 1 (establish the pattern):**
  1. `src/lib/motion.ts` toolkit.
  2. `<MotionConfig reducedMotion="user">` at app root.
  3. Convert `MobileNavDrawer`.
  4. Upgrade `Skeleton` (shimmer + reduced-motion fallback).
  5. Wire `LoadingSwap` into ONE surface (Home) as the reference.
- **Phase 2 (roll out):**
  1. Apply `LoadingSwap` + `Empty` entrance across remaining surfaces (Events,
     Teams, Compare, Picklist, My Team).
  2. Apply the overlay keyframe retune globally via the ui components.

## Constraints & verification

- Only `motion` added; no other deps.
- All motion reduced-motion safe via `MotionConfig` (plus retained CSS guards).
- Verify in the dev server browser: no layout shift, correct in light + dark
  mode, mobile drawer drag-to-close feels right, skeleton→content swap is smooth.

## Testing notes

This is a client-only visual/behavioral change. Verification is primarily
browser-based (preview + screenshots) rather than unit tests, consistent with
the rest of the app. Confirm reduced-motion behavior by toggling the OS setting
(or emulating it) and checking that overlays/reveals become instant.
