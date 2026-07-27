// Spotlight-tier event lookup (the VEX event tier, unrelated to the ⌘K spotlight
// palette).
//
// The problem: RobotEvents reports a Spotlight event with `level: "World"` — the
// same value a real World Championship gets — and no other field, on the API or
// the public event page, distinguishes them. The only structured source is the
// events.vex.com listing's "Level Class" filter, which /api/spotlight-events reads
// server-side and returns as a SKU list. See server/spotlightEvents.ts.
//
// When we pay for it: only a `level: "World"` event is ambiguous, so the lookup is
// triggered by seeing one in an events payload (see noteEventsForSpotlightTier,
// called from the three api.ts endpoints that return events). A visit that never
// loads a World-level event never asks. One request per page load at most, and the
// answer covers every Spotlight event at once — there is no per-event check to
// make, since an individual event page carries no Spotlight marker either.

import { useSyncExternalStore } from "react";

import type { Event } from "./types";

let skus = new Set<string>();
let version = 0;
const listeners = new Set<() => void>();

/** Subscribe to load completion — event tiers change once, when the set arrives. */
export function subscribeSpotlightTier(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const getSpotlightTierVersion = () => version;

/**
 * Version counter for dependency arrays. Any useMemo that groups, filters, or
 * sorts by event tier must list this, or it keeps the result it computed before
 * the SKU set arrived (the badge would say Spotlight while a tier filter found
 * nothing).
 */
export function useSpotlightTier() {
  return useSyncExternalStore(subscribeSpotlightTier, getSpotlightTierVersion, getSpotlightTierVersion);
}

/** True when this SKU is a Spotlight-tier event. False until the set has loaded. */
export const isSpotlightSku = (sku?: string | null) => !!sku && skus.has(sku.toUpperCase());

let requested = false;

/** Fetch the SKU set once per page load. Safe to call repeatedly. */
export function loadSpotlightTier() {
  if (requested) return;
  requested = true;
  fetch("/api/spotlight-events")
    .then((res) => (res.ok ? res.json() : null))
    .then((payload: { skus?: string[] } | null) => {
      if (!payload?.skus?.length) return;
      skus = new Set(payload.skus.map((sku) => sku.toUpperCase()));
      version += 1;
      listeners.forEach((listener) => listener());
    })
    // On failure these events keep their RobotEvents level, i.e. they read as
    // Worlds — the behaviour that predates this lookup.
    .catch(() => {});
}

/**
 * Trigger the lookup if a payload contains an event whose tier is ambiguous.
 *
 * `level: "World"` is the only ambiguous value: every other level ("Signature",
 * "National", "State", "Regional", "Other") already identifies its tier exactly,
 * and no Spotlight event has been observed reporting anything but "World". If VEX
 * ever tags one differently it will read as that tier instead — the failure mode is
 * a wrong badge, not a broken page.
 */
export function noteEventsForSpotlightTier(payload: Event | Event[] | null | undefined) {
  if (requested || !payload) return;
  const rows = Array.isArray(payload) ? payload : [payload];
  if (rows.some((event) => event?.level === "World")) loadSpotlightTier();
}
