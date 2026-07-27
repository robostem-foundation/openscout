// Resolves the #1 world-skills team for one program + grade level.
//
// Why this is server-side: the upstream leaderboard
// (`events.vex.com/api/seasons/{id}/skills`) is a single multi-megabyte array of
// every ranked team in the world. The home sidebar needs exactly one row from
// each of four leaderboards, so fetching them in the browser would cost ~20 MB
// per home-page view. This trims each response to its top entry (a few hundred
// bytes) before it leaves the server, and the season lookup happens here too so
// the client needs one request per card and no season list of its own.
//
// Caching: an in-process cache covers repeat hits on a warm instance, and the
// route sets a long `s-maxage` so the edge serves most viewers without ever
// reaching the upstream. Skills scores only change while events are running, so
// minutes-old data is fine.

const RE_API_BASE = () => (process.env.ROBOTEVENTS_API_BASE ?? "https://events.vex.com/api/v2").replace(/\/$/, "");
const RE_ROOT_BASE = () => (process.env.ROBOTEVENTS_ROOT_BASE ?? "https://events.vex.com").replace(/\/$/, "");

export const TOP_SKILLS_PROGRAMS = { v5rc: 1, viqrc: 41 } as const;
export type TopSkillsProgram = keyof typeof TOP_SKILLS_PROGRAMS;

// The URL vocabulary the /skills page already uses (see wsGradeToParam) mapped to
// the grade_level values the upstream endpoint accepts. Note "Elementary", not
// "Elementary School" — the endpoint rejects the longer spelling.
const GRADE_PARAMS = { hs: "High School", ms: "Middle School", es: "Elementary" } as const;
export type TopSkillsGrade = keyof typeof GRADE_PARAMS;

// Which grades each program actually runs, so a nonsense pair (V5RC elementary)
// is rejected instead of burning an upstream request on an empty leaderboard.
const PROGRAM_GRADES: Record<TopSkillsProgram, TopSkillsGrade[]> = {
  v5rc: ["hs", "ms"],
  viqrc: ["ms", "es"],
};

export function isTopSkillsProgram(value: string | null): value is TopSkillsProgram {
  return value != null && value in TOP_SKILLS_PROGRAMS;
}

export function isTopSkillsGrade(value: string | null): value is TopSkillsGrade {
  return value != null && value in GRADE_PARAMS;
}

export function programRunsGrade(program: TopSkillsProgram, grade: TopSkillsGrade) {
  return PROGRAM_GRADES[program].includes(grade);
}

export type TopSkillsEntry = {
  rank: number;
  teamId: number;
  team: string;
  teamName: string | null;
  organization: string | null;
  region: string | null;
  country: string | null;
  score: number;
  driver: number;
  programming: number;
};

export type TopSkillsResult = {
  program: TopSkillsProgram;
  grade: TopSkillsGrade;
  seasonId: number | null;
  seasonName: string | null;
  entry: TopSkillsEntry | null;
};

type UpstreamSeason = { id: number; name?: string | null; program?: { id?: number } | null };
type UpstreamSkillsRow = {
  rank?: number;
  team?: {
    id?: number;
    team?: string;
    teamName?: string | null;
    organization?: string | null;
    eventRegion?: string | null;
    country?: string | null;
  } | null;
  scores?: { score?: number; driver?: number; programming?: number } | null;
};

function authHeaders() {
  return {
    Authorization: `Bearer ${process.env.ROBOTEVENTS_API_KEY ?? ""}`,
    Accept: "application/json",
  };
}

async function fetchJson<T>(url: string, timeoutMs: number): Promise<T> {
  const res = await fetch(url, { headers: authHeaders(), signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

// Mirrors MIN_SEASON_ID in src/App.tsx: older seasons return empty skills.
const MIN_SEASON_ID = 114;

// Season list is small and changes once a year, so one process-lifetime cache
// entry serves every program and grade.
let seasonCache: { at: number; seasons: UpstreamSeason[] } | null = null;
const SEASONS_TTL_MS = 6 * 60 * 60 * 1000;

async function programSeasons(program: TopSkillsProgram): Promise<UpstreamSeason[]> {
  if (!seasonCache || Date.now() - seasonCache.at > SEASONS_TTL_MS) {
    const payload = await fetchJson<{ data?: UpstreamSeason[] }>(`${RE_API_BASE()}/seasons?per_page=250`, 10000);
    seasonCache = { at: Date.now(), seasons: payload.data ?? [] };
  }
  const programId = TOP_SKILLS_PROGRAMS[program];
  return seasonCache.seasons
    .filter((season) => season.id >= MIN_SEASON_ID && season.program?.id === programId)
    .sort((a, b) => b.id - a.id);
}

/**
 * Newest season per program, as `{ programId, seasonId }`. Shared with the
 * Spotlight-tier lookup so both features use one cached season list.
 */
export async function currentSeasonByProgram(): Promise<Array<{ programId: number; seasonId: number }>> {
  const out: Array<{ programId: number; seasonId: number }> = [];
  for (const key of Object.keys(TOP_SKILLS_PROGRAMS) as TopSkillsProgram[]) {
    const newest = (await programSeasons(key))[0];
    if (newest) out.push({ programId: TOP_SKILLS_PROGRAMS[key], seasonId: newest.id });
  }
  return out;
}

async function leaderboard(seasonId: number, grade: TopSkillsGrade): Promise<UpstreamSkillsRow[]> {
  const params = new URLSearchParams({ post_season: "0", grade_level: GRADE_PARAMS[grade] });
  const payload = await fetchJson<unknown>(`${RE_ROOT_BASE()}/api/seasons/${seasonId}/skills?${params}`, 20000);
  // An unsupported grade level answers 200 with an error object rather than a
  // list, so normalise anything non-array to empty.
  return Array.isArray(payload) ? (payload as UpstreamSkillsRow[]) : [];
}

function topEntry(rows: UpstreamSkillsRow[]): TopSkillsEntry | null {
  let best: UpstreamSkillsRow | null = null;
  for (const row of rows) {
    if (row.team?.id == null || typeof row.rank !== "number") continue;
    if (!best || row.rank < (best.rank ?? Infinity)) best = row;
  }
  if (!best) return null;
  return {
    rank: best.rank ?? 1,
    teamId: best.team!.id!,
    team: best.team!.team ?? "",
    teamName: best.team!.teamName ?? null,
    organization: best.team!.organization ?? null,
    region: best.team!.eventRegion ?? null,
    country: best.team!.country ?? null,
    score: best.scores?.score ?? 0,
    driver: best.scores?.driver ?? 0,
    programming: best.scores?.programming ?? 0,
  };
}

const resultCache = new Map<string, { at: number; result: TopSkillsResult }>();
const RESULT_TTL_MS = 10 * 60 * 1000;

/**
 * Top-ranked team for a program + grade in the newest season that has skills data.
 *
 * A brand-new season exists in RobotEvents months before anyone has scored in it,
 * so an empty newest season falls back to the one before it — and the season it
 * settled on is returned so the client can deep-link to the same leaderboard.
 */
export async function resolveTopSkills(program: TopSkillsProgram, grade: TopSkillsGrade): Promise<TopSkillsResult> {
  const key = `${program}:${grade}`;
  const cached = resultCache.get(key);
  if (cached && Date.now() - cached.at < RESULT_TTL_MS) return cached.result;

  const seasons = await programSeasons(program);
  let result: TopSkillsResult = { program, grade, seasonId: seasons[0]?.id ?? null, seasonName: seasons[0]?.name ?? null, entry: null };

  // Two candidates at most: the current season, then last season for the offseason
  // gap. Any deeper and one cold request would stack several multi-MB fetches.
  for (const season of seasons.slice(0, 2)) {
    const entry = topEntry(await leaderboard(season.id, grade));
    if (entry) {
      result = { program, grade, seasonId: season.id, seasonName: season.name ?? null, entry };
      break;
    }
  }

  resultCache.set(key, { at: Date.now(), result });
  return result;
}
