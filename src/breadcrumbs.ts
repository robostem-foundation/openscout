// Navigation-history breadcrumb trail.
//
// Unlike a static hierarchy, this records the ACTUAL sequence of trackable pages
// the user moved through (Events list → an event → a team → another event …) so
// the breadcrumb reads like a trail of where they've been. The <Breadcrumbs>
// component renders the last few entries inline and collapses older ones behind
// a "..." dropdown.
//
// State is in-memory only (module-scoped): a full page load starts a fresh trail
// seeded from the current page. Accumulation happens across in-app (SPA)
// navigations, which keep this module alive.

export type CrumbKind = "list" | "event" | "team" | "org";
export type TrailEntry = { path: string; kind: CrumbKind; label: string };

let trail: TrailEntry[] = [];
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function subscribeTrail(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

// Returns the current trail. Stable reference between mutations so
// useSyncExternalStore doesn't loop.
export function getTrail(): TrailEntry[] {
  return trail;
}

const parentListFor = (kind: CrumbKind): TrailEntry | null => {
  if (kind === "event") return { path: "/events", kind: "list", label: "Events" };
  if (kind === "team") return { path: "/teams", kind: "list", label: "Teams" };
  return null; // org has no parent listing page
};

// Record arrival at a trackable page. Rules:
//  - Revisiting a page already in the trail truncates back to it (going "up").
//  - Landing on a listing page starts a fresh trail.
//  - An entity page appends; if the trail is empty it's seeded with the entity's
//    parent listing first, so a direct load still reads e.g. "Events / {event}".
export function recordTrail(entry: TrailEntry) {
  const idx = trail.findIndex((e) => e.path === entry.path);
  if (idx >= 0) {
    const kept = trail.slice(0, idx + 1);
    // Refresh the (possibly newer) label on revisit.
    kept[idx] = { ...kept[idx], label: entry.label || kept[idx].label };
    trail = kept;
  } else if (entry.kind === "list") {
    trail = [entry];
  } else {
    const base = trail.length === 0 ? [parentListFor(entry.kind)].filter(Boolean) as TrailEntry[] : trail;
    trail = [...base, entry];
  }
  emit();
}

// Replace a placeholder label (e.g. an event SKU) with the real name once the
// page's data loads. No-op if the entry is gone or unchanged.
export function refreshTrailLabel(path: string, label: string) {
  if (!label) return;
  const idx = trail.findIndex((e) => e.path === path);
  if (idx < 0 || trail[idx].label === label) return;
  trail = trail.map((e, i) => (i === idx ? { ...e, label } : e));
  emit();
}

// Drop the whole trail (used when returning to the home page).
export function clearTrail() {
  if (trail.length === 0) return;
  trail = [];
  emit();
}
