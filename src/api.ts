import type {
  Award,
  CountryGroup,
  CountryRegion,
  Event,
  EventInfoData,
  JumperPresetExists,
  Match,
  MatchTimestamp,
  Paginated,
  Program,
  Ranking,
  Season,
  Skill,
  SuperscoreRow,
  Team,
  TeamLight,
  TopSkillsResult,
  WorldSkillsEntry,
} from "./types";

import { noteEventsForSpotlightTier } from "./spotlightTier";
import { noteSeasonNames } from "./world-skills-cache";

/**
 * Pass a paginated event page through the Spotlight-tier trigger unchanged, and
 * record the seasons it mentions — every event carries its season's name, which
 * is what tells the world-skills cache whether a season is still being played.
 */
const notedEvents = (page: Paginated<Event>) => {
  noteEventsForSpotlightTier(page.data);
  noteSeasonNames(page.data.map((event) => event.season));
  return page;
};

/** Same, for the seasons endpoints — the authoritative source of season names. */
const notedSeasons = (page: Paginated<Season>) => {
  noteSeasonNames(page.data);
  return page;
};

type QueryValue = string | number | boolean | null | undefined;
type Query = Record<string, QueryValue | QueryValue[]>;

// In-flight request dedup: identical GETs issued while one is still pending
// share the same promise instead of firing a second network request. This
// collapses React StrictMode's double-mount and any concurrent callers that
// happen to request the same URL. The entry is removed once the request
// settles, so this is request-level dedup — not a response cache.
const inflight = new Map<string, Promise<unknown>>();

const dedupedJson = <T>(url: string): Promise<T> => {
  const existing = inflight.get(url);
  if (existing) return existing as Promise<T>;

  const promise = (async () => {
    const response = await fetch(url);
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.message ?? `Request failed with ${response.status}`);
    }
    return payload as T;
  })();

  inflight.set(url, promise);
  // Clear the entry once settled so future calls re-fetch fresh data.
  promise.finally(() => {
    if (inflight.get(url) === promise) inflight.delete(url);
  });
  return promise;
};

const jsonFrom = <T>(source: "rse" | "re" | "re-root" | "jumper", path: string, query: Query = {}): Promise<T> => {
  const params = new URLSearchParams();

  Object.entries(query).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item) => item !== undefined && item !== null && params.append(key, String(item)));
      return;
    }

    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  });

  return dedupedJson<T>(`/api/${source}/${path}${params.size ? `?${params.toString()}` : ""}`);
};

// Adapt a raw `teams_light` record into the app-wide `Team` shape. Kept in one place
// so the flat-array and paginated fetches map fields identically.
const mapTeamLight = (team: TeamLight): Team => ({
  id: team.team_id,
  number: team.team_num,
  team_name: team.team_name ?? null,
  robot_name: null,
  organization: team.org ?? null,
  location: team.location ?? null,
  registered: team.registered,
  program: team.program,
  grade: team.grade ?? null,
});

const rseJson = <T,>(path: string, query: Query = {}) => jsonFrom<T>("rse", path, query);
const robotEventsJson = <T,>(path: string, query: Query = {}) => jsonFrom<T>("re", path, query);
const robotEventsRootJson = <T,>(path: string, query: Query = {}) => jsonFrom<T>("re-root", path, query);
const jumperJson = <T,>(path: string, query: Query = {}) => jsonFrom<T>("jumper", path, query);

export const api = {
  programs: () => rseJson<Paginated<Program>>("programs", { per_page: 50 }),
  seasons: (query: Query = {}) => rseJson<Paginated<Season>>("seasons", { per_page: 50, ...query }).then(notedSeasons),
  robotEventsSeasons: (query: Query = {}) => robotEventsJson<Paginated<Season>>("seasons", { per_page: 250, ...query }).then(notedSeasons),
  robotEventsCountries: () => robotEventsRootJson<CountryGroup[]>("api/countries", { common: 1 }),
  robotEventsRegions: (countryId?: string | number) => robotEventsRootJson<CountryRegion[]>(countryId ? `api/regions/${countryId}` : "api/regions"),
  // The three event endpoints tap noteEventsForSpotlightTier: seeing a `level:
  // "World"` row is what triggers the Spotlight-tier lookup, so a session that
  // never loads an ambiguous event never spends a request. See src/spotlightTier.ts.
  events: (query: Query = {}) =>
    robotEventsJson<Paginated<Event>>("events", query).then(notedEvents),
  event: (id: string | number) =>
    robotEventsJson<Event>(`events/${id}`).then((event) => {
      noteEventsForSpotlightTier(event);
      return event;
    }),
  eventTeams: (id: string | number, query: Query = {}) => robotEventsJson<Paginated<Team>>(`events/${id}/teams`, query),
  eventMatches: (id: string | number, division: string | number, query: Query = {}) =>
    robotEventsJson<Paginated<Match>>(`events/${id}/divisions/${division}/matches`, query),
  eventRankings: (id: string | number, division: string | number, query: Query = {}) =>
    robotEventsJson<Paginated<Ranking>>(`events/${id}/divisions/${division}/rankings`, query),
  eventSkills: (id: string | number, query: Query = {}) => robotEventsJson<Paginated<Skill>>(`events/${id}/skills`, query),
  eventAwards: (id: string | number, query: Query = {}) => robotEventsJson<Paginated<Award>>(`events/${id}/awards`, query),
  robotEventsTeams: (query: Query = {}) => robotEventsJson<Paginated<Team>>("teams", query),
  teams: (query: Query = {}) => rseJson<Paginated<Team>>("teams", query),
  // `teams_light` is optimized for bulk lookups: with no `per_page` it returns the
  // *entire* matching set as a flat, unpaginated array, sorted alphabetically by
  // team number (2A before 10000P). It carries a leaner record than `teams` (uses
  // team_id/team_num/org names, no robot_name) but does include location, grade, and
  // registered. We adapt it into the `Paginated<Team>` shape the rest of the app
  // expects, synthesizing single-page meta so callers (caching, sorting, table) are
  // unchanged. Pass a `per_page` to instead get one server-paginated page — see
  // `teamsLightPage`.
  teamsLight: async (query: Query = {}): Promise<Paginated<Team>> => {
    const raw = await rseJson<TeamLight[]>("teams_light", query);
    const data = raw.map(mapTeamLight);
    return {
      meta: {
        current_page: 1,
        last_page: 1,
        next_page_url: null,
        prev_page_url: null,
        per_page: data.length,
        total: data.length,
        from: data.length ? 1 : null,
        to: data.length ? data.length : null,
      },
      data,
    };
  },
  // One server-paginated page of `teams_light` (requires `per_page`). Passing
  // `per_page` flips the endpoint from a flat array to a `{ meta, data }` envelope;
  // we pass its real meta straight through so the caller can see `last_page`/`total`.
  // Used for the fast first-page render before the full set streams in.
  teamsLightPage: async (query: Query = {}): Promise<Paginated<Team>> => {
    const res = await rseJson<Paginated<TeamLight>>("teams_light", query);
    return { meta: res.meta, data: res.data.map(mapTeamLight) };
  },
  team: (id: string | number) => robotEventsJson<Team>(`teams/${id}`),
  teamEvents: (id: string | number, query: Query = {}) =>
    robotEventsJson<Paginated<Event>>(`teams/${id}/events`, query).then(notedEvents),
  teamMatches: (id: string | number, query: Query = {}) => robotEventsJson<Paginated<Match>>(`teams/${id}/matches`, query),
  teamRankings: (id: string | number, query: Query = {}) => robotEventsJson<Paginated<Ranking>>(`teams/${id}/rankings`, query),
  teamSkills: (id: string | number, query: Query = {}) => robotEventsJson<Paginated<Skill>>(`teams/${id}/skills`, query),
  teamAwards: (id: string | number, query: Query = {}) => robotEventsJson<Paginated<Award>>(`teams/${id}/awards`, query),
  eventInfo: (sku: string): Promise<EventInfoData> => {
    const params = new URLSearchParams({ sku });
    return dedupedJson<EventInfoData>(`/api/event-info?${params.toString()}`);
  },
  // Grade levels for a batch of events, as `SKU:programId` pairs (the program is
  // needed to expand a "Grade Level: All" page into that program's span). Resolved
  // server-side, cache-first — see server/eventGrades.ts. SKUs the server couldn't
  // resolve are simply absent from the map.
  eventGrades: (items: string[]): Promise<{ grades: Record<string, string[]> }> => {
    const params = new URLSearchParams({ sku: items.join(",") });
    return dedupedJson<{ grades: Record<string, string[]> }>(`/api/event-grades?${params.toString()}`);
  },
  jumperPresetEventExists: (sku: string) => jumperJson<JumperPresetExists>("preset-event-exists", { sku }),
  jumperMatchTimestamps: (sku: string, query: Query = {}) => jumperJson<MatchTimestamp[]>("match-timestamp", { sku, ...query }),
  superscore: (program: "v5rc" | "viqrc", query: Query = {}) =>
    rseJson<Paginated<SuperscoreRow>>(`superscore/rankings/${program}`, query),
  // Server-trimmed: the full leaderboard is multi-MB, this returns one row.
  // See server/topSkills.ts.
  topSkills: (program: "v5rc" | "viqrc", grade: "hs" | "ms" | "es") =>
    dedupedJson<TopSkillsResult>(`/api/top-skills?program=${program}&grade=${grade}`),
  worldSkills: (seasonId: string | number, grade: string) =>
    robotEventsRootJson<WorldSkillsEntry[]>(`api/seasons/${seasonId}/skills`, { post_season: 0, grade_level: grade }),
};
