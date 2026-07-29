// The signed-in user's own program + grade level, used to *nudge* search results
// toward the competition they actually compete in.
//
// Source of truth is the profile (`team_number` + `team_program`), not the shared
// teams — a scout may be in several shared teams, but only one profile team is
// "mine". The program id is on the profile directly; the grade level is not, so it
// comes from one RobotEvents team lookup and is cached in localStorage (a team's
// grade changes at most once a season, and a wrong grade only mis-nudges an
// ordering, so a stale entry is cheap).
//
// Deliberately a module-level store rather than context: the ranking functions in
// App.tsx are pure module functions called from effects and non-React code, so
// they read this synchronously via `readSearchBias()`. React callers subscribe
// with `useSearchBias()` and feed its version counter into their dep arrays so a
// late-arriving grade re-sorts what is already on screen.

import { useSyncExternalStore } from "react";

import { api } from "./api";

export type GradeCode = "ES" | "MS" | "HS" | "U";

export type SearchBias = {
  /** RobotEvents program id (1 = V5RC, 41 = VIQRC, 4 = VURC, 57 = VAIRC). */
  programId: number | null;
  gradeCode: GradeCode | null;
};

const NO_BIAS: SearchBias = { programId: null, gradeCode: null };
const GRADE_CACHE_KEY = "vex-my-team-grade";

let bias: SearchBias = NO_BIAS;
let version = 0;
const listeners = new Set<() => void>();

function emit() {
  version += 1;
  for (const listener of listeners) listener();
}

/** Synchronous read for module-level ranking functions. */
export function readSearchBias(): SearchBias {
  return bias;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getVersion = () => version;

/**
 * Version counter for dependency arrays. Any memo/effect that ranks teams or
 * events must list this, or it keeps the order it computed before the profile
 * (or the grade lookup) landed.
 */
export function useSearchBias(): number {
  return useSyncExternalStore(subscribe, getVersion, getVersion);
}

function setBias(next: SearchBias) {
  if (next.programId === bias.programId && next.gradeCode === bias.gradeCode) return;
  bias = next;
  emit();
}

export function clearSearchBias() {
  setBias(NO_BIAS);
}

/** Maps a RobotEvents grade string ("High School", "College") to a short code. */
export function toGradeCode(grade?: string | null): GradeCode | null {
  const value = (grade ?? "").toLowerCase();
  if (value.includes("elementary")) return "ES";
  if (value.includes("middle")) return "MS";
  if (value.includes("high")) return "HS";
  if (value.includes("college") || value.includes("university")) return "U";
  return null;
}

// --- grade lookup ------------------------------------------------------------

function gradeCacheKey(programId: number, number: string) {
  return `${GRADE_CACHE_KEY}:${programId}:${number.toUpperCase()}`;
}

function readCachedGrade(programId: number, number: string): GradeCode | null {
  try {
    return toGradeCode(localStorage.getItem(gradeCacheKey(programId, number)));
  } catch {
    return null;
  }
}

function writeCachedGrade(programId: number, number: string, grade: string) {
  try {
    localStorage.setItem(gradeCacheKey(programId, number), grade);
  } catch {
    // private mode / quota — the lookup just repeats next session
  }
}

// Programs whose grade span is a single value: no lookup needed, and none is
// possible for VAIRC (HS *or* University) without the team row anyway.
const UNAMBIGUOUS_PROGRAM_GRADE: Record<number, GradeCode> = { 4: "U" };

let lookupKey = "";

/**
 * Point the bias at the profile's team. Cheap and idempotent — safe to call on
 * every profile render. Passing nulls (signed out, or no team set) clears it.
 */
export function syncSearchBias(programIdRaw?: string | null, teamNumber?: string | null) {
  const programId = programIdRaw ? Number(programIdRaw) : NaN;
  const number = (teamNumber ?? "").trim();
  if (!Number.isFinite(programId) || !number) {
    lookupKey = "";
    clearSearchBias();
    return;
  }

  const key = `${programId}:${number.toUpperCase()}`;
  const known = UNAMBIGUOUS_PROGRAM_GRADE[programId] ?? readCachedGrade(programId, number);

  // Publish the program immediately — it is the larger half of the nudge, and it
  // needs no network. The grade fills in after the lookup.
  setBias({ programId, gradeCode: known });
  if (known || lookupKey === key) return;

  lookupKey = key;
  void api
    .robotEventsTeams({ number: number.toUpperCase(), "program[]": [programId], per_page: 5 })
    .then(({ data }) => {
      const grade = data.find((team) => team.grade)?.grade;
      if (!grade) return;
      writeCachedGrade(programId, number, grade);
      // Ignore a result that arrived after the profile changed again.
      if (lookupKey !== key) return;
      setBias({ programId, gradeCode: toGradeCode(grade) });
    })
    .catch(() => {
      // Offline / rate-limited: keep the program-only nudge and retry next mount.
      if (lookupKey === key) lookupKey = "";
    });
}
