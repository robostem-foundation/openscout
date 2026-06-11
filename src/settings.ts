import { useSyncExternalStore } from "react";
import { supabase } from "./supabase";

// Settings sync for the event-filter preferences. Same backend-switching idea as
// the favorites store:
//   • signed out → localStorage (identical to the original behavior)
//   • signed in  → the Supabase `user_settings.settings` jsonb (synced across devices)
//
// The component (EventsPage) keeps reading these two keys from localStorage in its
// lazy useState initializers. This store's job is to (a) mirror the cloud values
// into localStorage before bumping `epoch`, so a remount keyed on `epoch` re-reads
// the synced values without touching the initializers, and (b) route writes to the
// right backend. Cloud wins per key on load; local-only keys are seeded up.

const EVENTS_PROGRAMS_KEY = "vex-events-programs";
const EVENTS_FILTERS_KEY = "vex-events-filters";
const TAB_LAYOUT_KEY = "vex-tab-layout";
const UI_STYLE_KEY = "vex-ui-style";
const QUICK_VIEW_FIRST_KEY = "vex-quick-view-first";
const QUICK_VIEW_EXPAND_KEY = "vex-quick-view-expand-extras";
const SYNCED_KEYS = [EVENTS_PROGRAMS_KEY, EVENTS_FILTERS_KEY, TAB_LAYOUT_KEY, UI_STYLE_KEY, QUICK_VIEW_FIRST_KEY, QUICK_VIEW_EXPAND_KEY] as const;
export type SyncedSettingKey = (typeof SYNCED_KEYS)[number];

// Tab orientation for the event/team detail views. "horizontal" matches the
// original look (a tab bar above the content); "vertical" mirrors the Settings
// page's left-rail tabs.
export type TabLayout = "horizontal" | "vertical";

// Interface skin. "classic" is the original Bootstrap-flavored look; "modern" is
// a Geist-inspired skin that re-points the design tokens (colors/radius/font).
// Orthogonal to light/dark — both skins have light and dark variants. Applied to
// <html data-ui="modern">; an early script in index.html sets it pre-paint.
export type UiStyle = "classic" | "modern";

type Values = Record<string, unknown>;

let epoch = 0;
let currentValues: Values = {};
let signedIn = false;
let userId: string | null = null;

const listeners = new Set<() => void>();
// Separate listener set for the tab-layout value. Unlike the epoch (which drives
// an EventsPage remount), these fire whenever the layout value changes — including
// self-writes — so EventDetail/TeamDetail/Settings re-render live.
const tabListeners = new Set<() => void>();
// Separate listener set for the UI-style value (same rationale as tabListeners).
const uiListeners = new Set<() => void>();
// Separate listener set for the quick-view-first preference (same rationale).
const quickViewListeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function emitTab() {
  for (const listener of tabListeners) listener();
}

function emitUi() {
  for (const listener of uiListeners) listener();
}

function emitQuickViewFirst() {
  for (const listener of quickViewListeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getEpoch() {
  return epoch;
}

// Bump epoch (→ remount) only when the synced values actually changed. Used by the
// load paths; self-writes from the component deliberately do NOT bump epoch.
function commit(values: Values) {
  if (sameValues(values, currentValues)) return;
  currentValues = values;
  epoch += 1;
  emit();
  emitTab(); // a load may have changed the synced tab layout
  applyUiDom(getUiStyle()); // adopt a synced UI skin on load (cloud-wins)
  emitUi();
  emitQuickViewFirst(); // a load may have changed the synced quick-view preference
}

function sameValues(a: Values, b: Values): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// --- localStorage helpers --------------------------------------------------

function readLS(key: string): unknown {
  const raw = localStorage.getItem(key);
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function writeLS(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

function snapshotLocal(): Values {
  const out: Values = {};
  for (const key of SYNCED_KEYS) {
    const value = readLS(key);
    if (value !== undefined) out[key] = value;
  }
  return out;
}

function loadLocal() {
  signedIn = false;
  commit(snapshotLocal());
}

// --- Supabase backend ------------------------------------------------------

async function fetchCloud(sb: NonNullable<typeof supabase>, uid: string): Promise<Values> {
  const { data } = await sb.from("user_settings").select("settings").eq("user_id", uid).maybeSingle();
  return ((data?.settings ?? {}) as Values) || {};
}

async function upsertCloud(sb: NonNullable<typeof supabase>, uid: string, settings: Values) {
  await sb
    .from("user_settings")
    .upsert({ user_id: uid, settings, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
}

async function loadCloud(uid: string) {
  const sb = supabase;
  if (!sb) return;
  userId = uid;
  signedIn = true;

  const cloud = await fetchCloud(sb, uid);
  const local = snapshotLocal();

  // Cloud wins per key; seed any local-only keys up to the cloud (non-destructive).
  const merged: Values = {};
  let needSeed = false;
  for (const key of SYNCED_KEYS) {
    if (cloud[key] !== undefined) merged[key] = cloud[key];
    else if (local[key] !== undefined) {
      merged[key] = local[key];
      needSeed = true;
    }
  }
  if (needSeed) await upsertCloud(sb, uid, merged);

  // Mirror the synced values into localStorage so the page's lazy initializers
  // read them on the remount that the epoch bump triggers.
  for (const key of SYNCED_KEYS) if (merged[key] !== undefined) writeLS(key, merged[key]);

  commit(merged);
}

// --- auth wiring -----------------------------------------------------------

let loadedFor: string | null | undefined = undefined;

function applyAuth(uid: string | null) {
  if (uid === loadedFor) return;
  loadedFor = uid;
  if (uid) {
    void loadCloud(uid);
  } else {
    userId = null;
    loadLocal();
  }
}

(function init() {
  loadLocal(); // synchronous first paint from localStorage — no flash when signed out
  const sb = supabase;
  if (!sb) return;
  void sb.auth.getSession().then(({ data }) => applyAuth(data.session?.user?.id ?? null));
  sb.auth.onAuthStateChange((_event, session) => applyAuth(session?.user?.id ?? null));
})();

// --- public API ------------------------------------------------------------

// Persist the event settings. Writes localStorage always (so signed-out use and a
// later reload are instant), and upserts the cloud jsonb when signed in. Does not
// bump epoch — the component is the source of this change and must keep its state.
export function setEventsSettings(patch: Partial<Record<SyncedSettingKey, unknown>>) {
  for (const key of Object.keys(patch) as SyncedSettingKey[]) writeLS(key, patch[key]);

  const next: Values = { ...currentValues, ...patch };
  if (sameValues(next, currentValues)) return;
  currentValues = next;

  if (signedIn && supabase && userId) {
    void upsertCloud(supabase, userId, next);
  }
}

// Returns a counter that increments when synced settings load/change externally
// (sign-in pulling cloud filters, sign-out reverting to local). Key the EventsPage
// on it to re-read the freshly-synced values.
export function useSettingsEpoch(): number {
  return useSyncExternalStore(subscribe, getEpoch, getEpoch);
}

// --- tab layout preference --------------------------------------------------

function subscribeTab(listener: () => void) {
  tabListeners.add(listener);
  return () => {
    tabListeners.delete(listener);
  };
}

function getTabLayout(): TabLayout {
  return currentValues[TAB_LAYOUT_KEY] === "vertical" ? "vertical" : "horizontal";
}

// Live tab-orientation value (signed-out → localStorage; signed-in → cloud jsonb,
// cloud-wins on load). Default "horizontal" preserves the original look.
export function useTabLayout(): TabLayout {
  return useSyncExternalStore(subscribeTab, getTabLayout, getTabLayout);
}

// Persist the tab layout. Writes localStorage always and upserts the cloud jsonb
// when signed in (same backend as the event filters). Notifies tab subscribers.
export function setTabLayout(value: TabLayout) {
  writeLS(TAB_LAYOUT_KEY, value);
  const next: Values = { ...currentValues, [TAB_LAYOUT_KEY]: value };
  if (sameValues(next, currentValues)) return;
  currentValues = next;
  if (signedIn && supabase && userId) void upsertCloud(supabase, userId, next);
  emitTab();
}

// --- UI style (interface skin) ----------------------------------------------

// Toggle the <html data-ui="modern"> attribute. "classic" removes it (default).
function applyUiDom(value: UiStyle) {
  const root = typeof document !== "undefined" ? document.documentElement : null;
  if (!root) return;
  if (value === "modern") root.setAttribute("data-ui", "modern");
  else root.removeAttribute("data-ui");
}

function subscribeUi(listener: () => void) {
  uiListeners.add(listener);
  return () => {
    uiListeners.delete(listener);
  };
}

function getUiStyle(): UiStyle {
  return currentValues[UI_STYLE_KEY] === "modern" ? "modern" : "classic";
}

// Live interface-skin value (signed-out → localStorage; signed-in → cloud jsonb,
// cloud-wins on load). Default "classic" preserves the original look.
export function useUiStyle(): UiStyle {
  return useSyncExternalStore(subscribeUi, getUiStyle, getUiStyle);
}

// Persist the UI style. Writes localStorage always and upserts the cloud jsonb
// when signed in, applies it to the DOM immediately, and notifies subscribers.
export function setUiStyle(value: UiStyle) {
  writeLS(UI_STYLE_KEY, value);
  const next: Values = { ...currentValues, [UI_STYLE_KEY]: value };
  if (sameValues(next, currentValues)) {
    applyUiDom(value);
    return;
  }
  currentValues = next;
  if (signedIn && supabase && userId) void upsertCloud(supabase, userId, next);
  applyUiDom(value);
  emitUi();
}

// --- quick-view-first preference --------------------------------------------

function subscribeQuickViewFirst(listener: () => void) {
  quickViewListeners.add(listener);
  return () => {
    quickViewListeners.delete(listener);
  };
}

// Default true: only a stored literal `false` turns it off, so a fresh user (or
// any unset key) gets the quick-view-first behavior.
function getQuickViewFirst(): boolean {
  const v = currentValues[QUICK_VIEW_FIRST_KEY];
  return v === undefined ? true : v === true;
}

// Live "open quick view first" value (signed-out → localStorage; signed-in →
// cloud jsonb, cloud-wins on load). When false, clicking a team navigates
// straight to the full team page (the original behavior).
export function useQuickViewFirst(): boolean {
  return useSyncExternalStore(subscribeQuickViewFirst, getQuickViewFirst, getQuickViewFirst);
}

export function setQuickViewFirst(value: boolean) {
  writeLS(QUICK_VIEW_FIRST_KEY, value);
  const next: Values = { ...currentValues, [QUICK_VIEW_FIRST_KEY]: value };
  if (sameValues(next, currentValues)) return;
  currentValues = next;
  if (signedIn && supabase && userId) void upsertCloud(supabase, userId, next);
  emitQuickViewFirst();
}

// Whether the quick-view's Events & Awards sections start expanded (default
// false → collapsed). Reuses the quick-view listener set.
function getQuickViewExpandExtras(): boolean {
  return currentValues[QUICK_VIEW_EXPAND_KEY] === true;
}

export function useQuickViewExpandExtras(): boolean {
  return useSyncExternalStore(subscribeQuickViewFirst, getQuickViewExpandExtras, getQuickViewExpandExtras);
}

export function setQuickViewExpandExtras(value: boolean) {
  writeLS(QUICK_VIEW_EXPAND_KEY, value);
  const next: Values = { ...currentValues, [QUICK_VIEW_EXPAND_KEY]: value };
  if (sameValues(next, currentValues)) return;
  currentValues = next;
  if (signedIn && supabase && userId) void upsertCloud(supabase, userId, next);
  emitQuickViewFirst();
}
