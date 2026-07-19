import { useSyncExternalStore } from "react";

// Compare tray store — holds up to 3 teams for side-by-side comparison.
// Persisted to sessionStorage so it survives page refreshes within the same tab.
// _modalOpen is NOT persisted — the modal always opens fresh.
// Same epoch-based useSyncExternalStore pattern as shared-team-notes.ts.

export type TrayEntry = {
  teamId: number;
  teamNumber: string;   // e.g. "12345A" — for display and URL building
  programCode: string;  // e.g. "V5RC" — for teamPath
  teamName?: string;    // enriched when available, shown in tray chip
};

const SS_KEY = "vex-compare-tray";
const MAX_TRAY = 3;

// ── State ─────────────────────────────────────────────────────────────────────

let _entries: TrayEntry[] = (() => {
  try {
    const raw = sessionStorage.getItem(SS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return (parsed as TrayEntry[]).slice(0, MAX_TRAY);
  } catch {
    return [];
  }
})();

let _modalOpen = false;
let _contextSeasonId: number | null = null;
let _contextEventId: number | null = null;
let _epoch = 0;

const _listeners = new Set<() => void>();

function _emit() {
  for (const l of _listeners) l();
}

function subscribe(l: () => void) {
  _listeners.add(l);
  return () => { _listeners.delete(l); };
}

function getEpoch() { return _epoch; }

function bumpEpoch() {
  _epoch++;
  _emit();
}

function saveToSession() {
  try {
    sessionStorage.setItem(SS_KEY, JSON.stringify(_entries));
  } catch {
    // sessionStorage unavailable — best effort
  }
}

// ── Actions ───────────────────────────────────────────────────────────────────

/** Add a team to the tray. No-op if already present or tray is full. */
export function addToTray(entry: TrayEntry): void {
  if (_entries.length >= MAX_TRAY) return;
  if (_entries.some((e) => e.teamId === entry.teamId)) return;
  _entries = [..._entries, entry];
  saveToSession();
  bumpEpoch();
}

/** Remove a team from the tray by teamId. */
export function removeFromTray(teamId: number): void {
  _entries = _entries.filter((e) => e.teamId !== teamId);
  saveToSession();
  bumpEpoch();
}

/** Remove all teams from the tray and close the modal. */
export function clearTray(): void {
  _entries = [];
  _modalOpen = false;
  try { sessionStorage.removeItem(SS_KEY); } catch { /* ignore */ }
  bumpEpoch();
}

/** Open the comparison modal. No-op if fewer than 2 teams in tray.
 *  Pass the current event's season + event IDs so the modal can skip fetching
 *  team events and can show per-event stats when in an event context. */
export function openCompareModal(contextSeasonId?: number, contextEventId?: number): void {
  if (_entries.length < 2) return;
  _contextSeasonId = contextSeasonId ?? null;
  _contextEventId = contextEventId ?? null;
  _modalOpen = true;
  bumpEpoch();
}

/** Close the comparison modal. */
export function closeCompareModal(): void {
  _modalOpen = false;
  bumpEpoch();
}

// ── Getters ───────────────────────────────────────────────────────────────────

/** Season captured at the time the modal was last opened. Null if unknown. */
export function getContextSeasonId(): number | null {
  return _contextSeasonId;
}

/** Event ID captured at the time the modal was last opened. Null outside event pages. */
export function getContextEventId(): number | null {
  return _contextEventId;
}

export function isInTray(teamId: number): boolean {
  return _entries.some((e) => e.teamId === teamId);
}

export function canAddToTray(): boolean {
  return _entries.length < MAX_TRAY;
}

export function getTrayEntries(): TrayEntry[] {
  return _entries;
}

// ── Hooks ─────────────────────────────────────────────────────────────────────
// Epoch pattern: getSnapshot returns a primitive so useSyncExternalStore never
// sees a phantom reference change. Derived values are computed in the hook body,
// not inside getSnapshot — same fix as shared-team-notes.ts.

export function useCompareTray(): TrayEntry[] {
  useSyncExternalStore(subscribe, getEpoch, getEpoch);
  return _entries;
}

export function useIsInTray(teamId: number): boolean {
  useSyncExternalStore(subscribe, getEpoch, getEpoch);
  return _entries.some((e) => e.teamId === teamId);
}

export function useCompareModalOpen(): boolean {
  useSyncExternalStore(subscribe, getEpoch, getEpoch);
  return _modalOpen;
}
