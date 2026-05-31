import { useSyncExternalStore } from "react";

// Theme runtime store. Mirrors the useSyncExternalStore pattern in favorites.ts /
// settings.ts, but the only "backend" here is localStorage + the DOM:
//   • pref is persisted to localStorage under `vex-theme` (default "system")
//   • the resolved light/dark value is applied to <html data-theme>
//   • "system" tracks the OS via matchMedia and re-applies live
//
// Supabase is deliberately NOT touched here — the caller (AppearanceSettings /
// OnboardingModal) writes the cloud copy via updateProfile, and AuthProvider
// pushes the cloud value back in by calling setTheme() on load (cloud-wins).

export type ThemePref = "light" | "dark" | "system";

const LS_KEY = "vex-theme";
const DEFAULT_PREF: ThemePref = "system";

function isPref(value: unknown): value is ThemePref {
  return value === "light" || value === "dark" || value === "system";
}

function readStored(): ThemePref {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return isPref(raw) ? raw : DEFAULT_PREF;
  } catch {
    return DEFAULT_PREF;
  }
}

let pref: ThemePref = readStored();

const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): ThemePref {
  return pref;
}

function prefersDark(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;
}

function resolveDark(value: ThemePref): boolean {
  return value === "dark" || (value === "system" && prefersDark());
}

// Apply the resolved theme to the document root. The early inline script in
// index.html sets the same attribute before first paint to avoid a flash; this
// keeps it in sync afterwards.
function applyDom(value: ThemePref) {
  const root = document.documentElement;
  if (resolveDark(value)) root.setAttribute("data-theme", "dark");
  else root.removeAttribute("data-theme");
}

// Set the preference: persist, apply, and notify subscribers. Does NOT write to
// Supabase — that's the caller's responsibility (matches settings.ts separation).
export function setTheme(value: ThemePref) {
  pref = value;
  try {
    localStorage.setItem(LS_KEY, value);
  } catch {
    // ignore quota / unavailable storage
  }
  applyDom(value);
  emit();
}

export function useTheme(): ThemePref {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

(function init() {
  applyDom(pref); // covers signed-out first load (no profile to adopt from)

  // When the pref is "system", follow the OS live without a reload.
  if (typeof matchMedia === "function") {
    const mql = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (pref === "system") applyDom(pref);
    };
    if (typeof mql.addEventListener === "function") mql.addEventListener("change", onChange);
    else if (typeof mql.addListener === "function") mql.addListener(onChange);
  }
})();
