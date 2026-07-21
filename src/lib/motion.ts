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
