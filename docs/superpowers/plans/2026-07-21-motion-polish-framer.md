# Motion Polish Pass (Framer Motion, targeted) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add subtle, cohesive, beUI-style spring motion to overlays/transitions and loading/skeleton states, without importing beUI, and without regressing the app's existing reduced-motion behavior.

**Architecture:** One new shared motion toolkit (`src/lib/motion.ts`) defines spring presets and variants. A `<MotionConfig reducedMotion="user">` at the app root makes all Framer motion auto-degrade under reduced motion. Framer Motion is applied only where it clearly wins (mobile drawer, skeleton→content swaps, empty-state entrances); existing Radix overlays keep their mount logic and only get springier CSS keyframes.

**Tech Stack:** React 19, Vite 7, Tailwind v4, `tw-animate-css`, Radix (`radix-ui`), and the new `motion` (Framer Motion) package.

## Global Constraints

- Only ONE new runtime dependency: `motion`. No other animation libraries.
- Every animation MUST be reduced-motion safe (via `<MotionConfig reducedMotion="user">` for Framer; retain existing `@media (prefers-reduced-motion: reduce)` CSS guards).
- Do NOT restructure `src/App.tsx` or split it — follow the existing single-file pattern; make focused edits only.
- No new motion for the interactive-feedback layer (buttons/toggles), no list stagger/reorder/count-ups, no full Radix overlay conversion — out of scope this pass.
- Dark mode uses `[data-theme="dark"]` (not `.dark`). Any new CSS must respect existing tokens (`--surface-*`, `--background`, `--foreground`, etc.).
- Verification per task: `npx tsc -b` passes (no type errors) AND browser preview shows the intended behavior with no console errors / layout shift. There is no unit-test runner in this repo.

**Dev server:** started via the Browser pane (`preview_start` with the project's dev config), NOT raw Bash. Dev command is `npm run dev`.

---

## File Map

- Create: `src/lib/motion.ts` — spring presets, variants, duration/ease constants.
- Modify: `src/App.tsx` — `MotionConfig` root; convert `MobileNavDrawer`; add `LoadingSwap` helper; entrance on `Empty`; wire `LoadingSwap` into Home then remaining surfaces.
- Modify: `src/components/ui/skeleton.tsx` — shimmer variant + reduced-motion fallback.
- Modify: `src/styles.css` — shimmer utility; springier overlay keyframes if needed.
- Modify: `src/components/ui/{dialog,sheet,popover,dropdown-menu}.tsx` — springier enter/exit classes (no structural change).
- Modify: `package.json` / `package-lock.json` — add `motion`.

## Parallelism Map (inline execution with subagents)

- **Task 1** first (installs `motion`, creates toolkit).
- After Task 1, these touch **separate files** and may run in **parallel via subagents**:
  - **Task 2** (`src/components/ui/skeleton.tsx` + shimmer in `styles.css`)
  - **Task 3** (Radix overlay keyframes — `dialog/sheet/popover/dropdown-menu.tsx`)
- All **`src/App.tsx` tasks (4, 5, 6, 7)** edit the same 16.5k-line file and MUST run **serially** with respect to each other.
- Order: Task 1 → (Task 2 ‖ Task 3) → Task 4 → Task 5 → Task 6 → Task 7.

---

### Task 1: Install Framer Motion + create the motion toolkit

**Files:**
- Modify: `package.json`
- Create: `src/lib/motion.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (later tasks import these exact names from `@/lib/motion`):
  - `springSmooth`, `springGentle`, `springSnappy` (`Transition`)
  - `DUR` = `{ fast, base, slow }` (seconds), `EASE_OUT` (number[])
  - `fade`, `fadeScale`, `revealUp`, `slideInLeft`, `slideInRight` (`Variants`, each with `initial`/`animate`/`exit`)

- [ ] **Step 1: Install the dependency**

```bash
cd "/Users/axcdeng/Codex Projects/BlueallianceVEX" && npm install motion
```
Expected: `motion` added under `dependencies`; lockfile updates; install succeeds.

- [ ] **Step 2: Create `src/lib/motion.ts`**

```ts
import type { Transition, Variants } from "motion/react";

// Duration tokens (seconds). Keep motion short — this is a data-dense tool.
export const DUR = { fast: 0.15, base: 0.22, slow: 0.32 } as const;

// Soft ease-out for non-spring fades.
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;

// ── Spring presets (beUI-like feel) ──────────────────────────────
export const springSmooth: Transition = { type: "spring", stiffness: 320, damping: 34, mass: 0.9 };
export const springGentle: Transition = { type: "spring", stiffness: 220, damping: 30, mass: 1 };
export const springSnappy: Transition = { type: "spring", stiffness: 480, damping: 30, mass: 0.7 };

// ── Variants ─────────────────────────────────────────────────────
export const fade: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: DUR.base, ease: EASE_OUT } },
  exit: { opacity: 0, transition: { duration: DUR.fast, ease: EASE_OUT } },
};

export const fadeScale: Variants = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1, transition: springSmooth },
  exit: { opacity: 0, scale: 0.97, transition: { duration: DUR.fast, ease: EASE_OUT } },
};

export const revealUp: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: springGentle },
  exit: { opacity: 0, y: 4, transition: { duration: DUR.fast, ease: EASE_OUT } },
};

export const slideInLeft: Variants = {
  initial: { x: "-100%" },
  animate: { x: 0, transition: springSmooth },
  exit: { x: "-100%", transition: { duration: DUR.base, ease: EASE_OUT } },
};

export const slideInRight: Variants = {
  initial: { x: "100%" },
  animate: { x: 0, transition: springSmooth },
  exit: { x: "100%", transition: { duration: DUR.base, ease: EASE_OUT } },
};
```

- [ ] **Step 3: Typecheck**

```bash
cd "/Users/axcdeng/Codex Projects/BlueallianceVEX" && npx tsc -b
```
Expected: PASS. If `motion/react` type import errors, verify the `motion` package (v11+) installed correctly.

- [ ] **Step 4: Commit**

```bash
cd "/Users/axcdeng/Codex Projects/BlueallianceVEX" && git add package.json package-lock.json src/lib/motion.ts && git commit -m "feat(motion): add Framer Motion + shared motion toolkit"
```

---

### Task 2: Skeleton shimmer + reduced-motion fallback

> Parallel-safe with Task 3 (separate files). Pure CSS/className — does not import the toolkit.

**Files:**
- Modify: `src/components/ui/skeleton.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: existing `@keyframes shimmer` in `styles.css` (~line 3014).
- Produces: `Skeleton` renders a shimmer sweep by default; unchanged API.

- [ ] **Step 1: Confirm the existing shimmer keyframe**

```bash
cd "/Users/axcdeng/Codex Projects/BlueallianceVEX" && sed -n '3005,3025p' src/styles.css
```
Expected: an `@keyframes shimmer` + a class using it. Note the exact animated property.

- [ ] **Step 2: Add a shimmer utility in `src/styles.css`** (adapt to match the existing keyframe; do NOT define a second `shimmer` keyframe)

If the existing keyframe animates `transform: translateX`, add near it:
```css
/* Skeleton shimmer sweep — reuses the existing @keyframes shimmer. */
.skeleton-shimmer {
  position: relative;
  overflow: hidden;
  background: var(--surface-3);
}
.skeleton-shimmer::after {
  content: "";
  position: absolute;
  inset: 0;
  transform: translateX(-100%);
  background: linear-gradient(
    90deg,
    transparent,
    color-mix(in srgb, var(--foreground) 8%, transparent),
    transparent
  );
  animation: shimmer 1.4s infinite;
}
@media (prefers-reduced-motion: reduce) {
  .skeleton-shimmer::after { display: none; }
}
```
If the existing keyframe animates `background-position` instead, apply that keyframe directly to `.skeleton-shimmer` with a gradient background, keeping the reduced-motion guard.

- [ ] **Step 3: Update `src/components/ui/skeleton.tsx`**

```tsx
import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("skeleton-shimmer rounded-md", className)}
      {...props}
    />
  )
}

export { Skeleton }
```

- [ ] **Step 4: Typecheck**

```bash
cd "/Users/axcdeng/Codex Projects/BlueallianceVEX" && npx tsc -b
```
Expected: PASS.

- [ ] **Step 5: Browser verify**

Navigate to a loading state (a table/page rendering `Skeleton`/`LoadingTable`). Confirm: shimmer sweeps; under emulated reduced motion the sweep stops with a clean static surface; correct in light + dark.

- [ ] **Step 6: Commit**

```bash
cd "/Users/axcdeng/Codex Projects/BlueallianceVEX" && git add src/components/ui/skeleton.tsx src/styles.css && git commit -m "feat(motion): shimmer skeletons with reduced-motion fallback"
```

---

### Task 3: Springier Radix overlay keyframes

> Parallel-safe with Task 2 (separate files). No structural change to Radix — class/keyframe tuning only.

**Files:**
- Modify: `src/components/ui/dialog.tsx`, `sheet.tsx`, `popover.tsx`, `dropdown-menu.tsx`
- Modify (if a custom ease is needed): `src/styles.css`

**Interfaces:**
- Consumes: `tw-animate-css` enter/exit utilities already on these components (`data-[state=open]:animate-in`, `fade-in-0`, `zoom-in-95`, etc.).
- Produces: identical Radix mount behavior; enter reads with a subtle spring/overshoot.

- [ ] **Step 1: Inspect current enter/exit classes**

```bash
cd "/Users/axcdeng/Codex Projects/BlueallianceVEX" && grep -n "state=open\|state=closed\|duration-" src/components/ui/dialog.tsx src/components/ui/sheet.tsx src/components/ui/popover.tsx src/components/ui/dropdown-menu.tsx
```
Expected: lists the `data-[state=*]:animate-*` / `duration-*` classes on each `Content`/`Overlay`.

- [ ] **Step 2: Define a spring-like enter ease in `src/styles.css`**

Add a reusable timing utility (a back-ease gives the beUI overshoot):
```css
/* Springy overshoot ease for overlay enters (used with tw-animate-css). */
.ease-spring-in {
  animation-timing-function: cubic-bezier(0.34, 1.56, 0.64, 1);
}
@media (prefers-reduced-motion: reduce) {
  .ease-spring-in { animation-timing-function: linear; }
}
```

- [ ] **Step 3: Apply to each overlay's Content (open state only)**

In `dialog.tsx` `DialogContent`, `sheet.tsx` sheet content, `popover.tsx` `PopoverContent`, `dropdown-menu.tsx` `DropdownMenuContent`: append `data-[state=open]:ease-spring-in` to the existing className string, and bump the open duration slightly (e.g. `duration-200` → keep, or add `data-[state=open]:duration-300`) so the overshoot is perceptible. Leave exit (`data-[state=closed]:*`) as-is (crisp close). Do NOT change portal/overlay structure or Radix props.

Example (dialog Content — append, don't replace existing classes):
```
... data-[state=open]:zoom-in-95 data-[state=open]:ease-spring-in data-[state=open]:duration-300 ...
```

- [ ] **Step 4: Typecheck**

```bash
cd "/Users/axcdeng/Codex Projects/BlueallianceVEX" && npx tsc -b
```
Expected: PASS.

- [ ] **Step 5: Browser verify**

Open a dialog, a sheet, a popover, and a dropdown. Confirm: each enters with a subtle overshoot, exits cleanly, no flicker/double-animation; correct in light + dark; under reduced motion the overshoot flattens.

- [ ] **Step 6: Commit**

```bash
cd "/Users/axcdeng/Codex Projects/BlueallianceVEX" && git add src/components/ui/dialog.tsx src/components/ui/sheet.tsx src/components/ui/popover.tsx src/components/ui/dropdown-menu.tsx src/styles.css && git commit -m "feat(motion): springier Radix overlay enter transitions"
```

---

### Task 4: MotionConfig at the app root

> `src/App.tsx` edit — serial. Small, isolated, do first among App.tsx tasks so all Framer motion is reduced-motion safe from the start.

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `motion` package.
- Produces: all descendant Framer animations honor `reducedMotion="user"`.

- [ ] **Step 1: Find the app root render**

```bash
cd "/Users/axcdeng/Codex Projects/BlueallianceVEX" && grep -n "function App\|export default\|<Layout\|return (" src/App.tsx | head -20
```
Identify the top-level `App` component's returned tree (the outermost wrapper rendered once).

- [ ] **Step 2: Import and wrap**

Add to the existing `motion` imports (or a new import line):
```ts
import { MotionConfig } from "motion/react";
```
Wrap the outermost element returned by the top-level `App` component:
```tsx
<MotionConfig reducedMotion="user">
  {/* existing top-level tree unchanged */}
</MotionConfig>
```
Do not move providers; `MotionConfig` can be the outermost wrapper or sit just inside the existing outermost provider — either is fine as long as it wraps everything that will use motion.

- [ ] **Step 3: Typecheck**

```bash
cd "/Users/axcdeng/Codex Projects/BlueallianceVEX" && npx tsc -b
```
Expected: PASS.

- [ ] **Step 4: Browser verify**

App loads normally, no console errors, no visual change yet.

- [ ] **Step 5: Commit**

```bash
cd "/Users/axcdeng/Codex Projects/BlueallianceVEX" && git add src/App.tsx && git commit -m "feat(motion): wrap app in MotionConfig reducedMotion=user"
```

---

### Task 5: Animate the mobile nav drawer

> `src/App.tsx` edit — serial. Convert the hand-rolled CSS drawer (`MobileNavDrawer`, ~line 3038) to Framer, preserving all behavior.

**Files:**
- Modify: `src/App.tsx` (`MobileNavDrawer`)
- Modify: `src/styles.css` (remove/neutralize the old class-based open/close transition so it doesn't fight Framer — keep layout/appearance rules)

**Interfaces:**
- Consumes: `AnimatePresence`, `motion` from `motion/react`; `springSmooth`, `slideInLeft` (or `slideInRight` per drawer side) and `fade` from `@/lib/motion`.
- Produces: drawer scrim fades; panel spring-slides in; drag toward the closed edge past threshold closes it; body-scroll lock / focus / Escape preserved.

- [ ] **Step 1: Re-read the current `MobileNavDrawer` and its CSS**

```bash
cd "/Users/axcdeng/Codex Projects/BlueallianceVEX" && sed -n '3038,3178p' src/App.tsx && grep -n "mobile-nav-root\|mobile-nav-scrim\|mobile-nav-drawer" src/styles.css
```
Note which side the drawer slides from (left vs right) to pick `slideInLeft`/`slideInRight`. Note the CSS transition rules driving `.open`.

- [ ] **Step 2: Convert the render tree**

Add imports (merge with existing `motion/react` import):
```ts
import { AnimatePresence, motion } from "motion/react";
import { fade, slideInLeft, springSmooth } from "@/lib/motion";
```
Replace the returned JSX so the whole drawer is gated by `AnimatePresence` on `open`. Keep the existing `useEffect` (scroll lock, Escape, focus), `panelRef`, `role`/`aria` attributes, and all nav content/handlers unchanged:
```tsx
return (
  <AnimatePresence>
    {open && (
      <div className="mobile-nav-root open" aria-hidden={false}>
        <motion.div
          className="mobile-nav-scrim"
          onClick={onClose}
          variants={fade}
          initial="initial"
          animate="animate"
          exit="exit"
        />
        <motion.div
          className="mobile-nav-drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
          ref={panelRef}
          tabIndex={-1}
          variants={slideInLeft}
          initial="initial"
          animate="animate"
          exit="exit"
          drag="x"
          dragConstraints={{ left: -320, right: 0 }}
          dragElastic={0.15}
          onDragEnd={(_e, info) => { if (info.offset.x < -80) onClose(); }}
        >
          {/* existing drawer head / id / nav / theme / footer content UNCHANGED */}
        </motion.div>
      </div>
    )}
  </AnimatePresence>
);
```
NOTE: if the drawer slides from the RIGHT, use `slideInRight`, set `dragConstraints={{ left: 0, right: 320 }}`, and close when `info.offset.x > 80`. Keep the `useEffect` guarded by `open` as-is (it already early-returns when closed).

- [ ] **Step 3: Neutralize the old CSS transition**

In `src/styles.css`, remove the `transform`/`opacity` transition + the `.mobile-nav-root:not(.open)` hide-via-transition rules for `.mobile-nav-scrim` / `.mobile-nav-drawer` so CSS no longer animates position/opacity (Framer owns that now). KEEP all static layout/size/color/z-index rules. If `.mobile-nav-root` uses `visibility/opacity` to gate interactivity, that's now handled by conditional render — drop those gating rules.

- [ ] **Step 4: Typecheck**

```bash
cd "/Users/axcdeng/Codex Projects/BlueallianceVEX" && npx tsc -b
```
Expected: PASS.

- [ ] **Step 5: Browser verify (mobile viewport)**

Resize to mobile. Open the drawer: scrim fades, panel spring-slides in. Drag the panel toward its closed edge past threshold → closes. Tap scrim → closes. Press Escape → closes. Confirm body scroll is locked while open and focus lands in the panel. Correct in light + dark. Under reduced motion the slide becomes instant/opacity-only.

- [ ] **Step 6: Commit**

```bash
cd "/Users/axcdeng/Codex Projects/BlueallianceVEX" && git add src/App.tsx src/styles.css && git commit -m "feat(motion): spring-animated mobile nav drawer with drag-to-close"
```

---

### Task 6: LoadingSwap helper + Empty entrance + wire into Home

> `src/App.tsx` edit — serial. Establishes the loading→loaded pattern on ONE surface (Home).

**Files:**
- Modify: `src/App.tsx` (add `LoadingSwap`; animate `Empty` ~line 2177; wire Home ~line 3982)

**Interfaces:**
- Consumes: `AnimatePresence`, `motion` from `motion/react`; `revealUp`, `fade` from `@/lib/motion`.
- Produces:
  - `LoadingSwap({ loading, skeleton, children }: { loading: boolean; skeleton: ReactNode; children: ReactNode })` — crossfades skeleton ↔ content.
  - `Empty` gains a `revealUp` entrance (same props/API as today).

- [ ] **Step 1: Add the `LoadingSwap` component** (place near `Status`/`LoadingTable`, ~line 2181)

```tsx
function LoadingSwap({
  loading,
  skeleton,
  children,
}: {
  loading: boolean;
  skeleton: ReactNode;
  children: ReactNode;
}) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={loading ? "skeleton" : "content"}
        variants={loading ? fade : revealUp}
        initial="initial"
        animate="animate"
        exit="exit"
      >
        {loading ? skeleton : children}
      </motion.div>
    </AnimatePresence>
  );
}
```
Ensure `AnimatePresence, motion` and `fade, revealUp` are imported (merge with existing motion imports).

- [ ] **Step 2: Animate `Empty`** (~line 2177)

```tsx
function Empty({ children = "Nothing here yet." }: { children?: ReactNode }) {
  return (
    <motion.div variants={revealUp} initial="initial" animate="animate" className="/* keep existing Empty classes */">
      {children}
    </motion.div>
  );
}
```
Preserve whatever wrapper element/classes `Empty` currently uses — swap the element to `motion.<same tag>` and add the variants props only.

- [ ] **Step 3: Wire Home's primary loading region**

In `Home` (~line 3982), find where it branches on a loading flag to render a skeleton/`LoadingTable` vs. content, and replace that ternary with:
```tsx
<LoadingSwap loading={loading} skeleton={<LoadingTable columns={/* existing */} />}>
  {/* existing loaded content */}
</LoadingSwap>
```
Use the surface's actual loading variable and existing skeleton. Only convert the main content region — do not wrap the whole page.

- [ ] **Step 4: Typecheck**

```bash
cd "/Users/axcdeng/Codex Projects/BlueallianceVEX" && npx tsc -b
```
Expected: PASS.

- [ ] **Step 5: Browser verify**

Load Home (throttle network or hard-reload to catch the loading state). Confirm skeleton shows, then content crossfades in with a gentle rise — no pop, no layout shift. Empty states (where present) settle in. Correct in light + dark; instant under reduced motion.

- [ ] **Step 6: Commit**

```bash
cd "/Users/axcdeng/Codex Projects/BlueallianceVEX" && git add src/App.tsx && git commit -m "feat(motion): LoadingSwap + Empty entrance, wired into Home"
```

---

### Task 7: Roll LoadingSwap out to remaining surfaces

> `src/App.tsx` edit — serial. Applies the established pattern to the other data surfaces.

**Files:**
- Modify: `src/App.tsx` (Events, Teams, Compare, Picklist, My Team loading regions)

**Interfaces:**
- Consumes: `LoadingSwap` (Task 6).
- Produces: consistent loading→loaded motion across the app.

- [ ] **Step 1: Find remaining skeleton/loading branches**

```bash
cd "/Users/axcdeng/Codex Projects/BlueallianceVEX" && grep -n "LoadingTable\|<Skeleton\|loading ?" src/App.tsx
```
Enumerate the main-content loading branches on Events, Teams, Compare, Picklist, My Team (skip tiny inline spinners and the ones already using `LoadingSwap`).

- [ ] **Step 2: Convert each primary loading region**

For each, replace the `loading ? <skeleton> : <content>` ternary with a `LoadingSwap` wrapper (same shape as Task 6 Step 3), using that surface's own loading flag and skeleton. Do one surface at a time; re-run typecheck between surfaces if unsure.

- [ ] **Step 3: Typecheck**

```bash
cd "/Users/axcdeng/Codex Projects/BlueallianceVEX" && npx tsc -b
```
Expected: PASS.

- [ ] **Step 4: Browser verify each surface**

Visit Events, Teams, Compare, Picklist, My Team. Confirm each shows skeleton → smooth crossfade to content, no layout shift, no double render. Correct in light + dark; instant under reduced motion.

- [ ] **Step 5: Commit**

```bash
cd "/Users/axcdeng/Codex Projects/BlueallianceVEX" && git add src/App.tsx && git commit -m "feat(motion): roll LoadingSwap out to remaining surfaces"
```

---

## Self-Review

**Spec coverage:**
- Motion foundation / toolkit → Task 1. ✓
- Reduced motion via `MotionConfig` → Task 4. ✓
- Mobile nav drawer (spring slide + drag-to-close) → Task 5. ✓
- Radix overlay keyframe retune (no structural change) → Task 3. ✓
- `CrossFade` left as-is → intentionally no task (spec says leave alone). ✓
- Skeleton shimmer + reduced-motion fallback → Task 2. ✓
- LoadingSwap loading→loaded → Task 6 (Home), Task 7 (rest). ✓
- Empty entrance → Task 6. ✓
- Rollout Phase 1/2 ordering → Parallelism Map + task order. ✓
- Only `motion` added → Task 1; Global Constraints. ✓

**Placeholder scan:** No TBD/TODO; every code step shows code. Task 5/6/7 intentionally reference "existing content/classes" because they modify a live 16.5k-line file — the grep/sed steps locate the exact code first, which is the correct approach for in-place edits rather than reproducing hundreds of unrelated lines.

**Type consistency:** `LoadingSwap` signature identical in Tasks 6 and 7. Toolkit export names (`springSmooth`, `springGentle`, `springSnappy`, `fade`, `fadeScale`, `revealUp`, `slideInLeft`, `slideInRight`, `DUR`, `EASE_OUT`) defined in Task 1 and referenced consistently thereafter. Import path `@/lib/motion` and package import `motion/react` used uniformly.
