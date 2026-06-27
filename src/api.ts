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
  WorldSkillsEntry,
} from "./types";

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

const rseJson = <T,>(path: string, query: Query = {}) => jsonFrom<T>("rse", path, query);
const robotEventsJson = <T,>(path: string, query: Query = {}) => jsonFrom<T>("re", path, query);
const robotEventsRootJson = <T,>(path: string, query: Query = {}) => jsonFrom<T>("re-root", path, query);
const jumperJson = <T,>(path: string, query: Query = {}) => jsonFrom<T>("jumper", path, query);

export const api = {
  programs: () => rseJson<Paginated<Program>>("programs", { per_page: 50 }),
  seasons: (query: Query = {}) => rseJson<Paginated<Season>>("seasons", { per_page: 50, ...query }),
  robotEventsSeasons: (query: Query = {}) => robotEventsJson<Paginated<Season>>("seasons", { per_page: 250, ...query }),
  robotEventsCountries: () => robotEventsRootJson<CountryGroup[]>("api/countries", { common: 1 }),
  robotEventsRegions: (countryId?: string | number) => robotEventsRootJson<CountryRegion[]>(countryId ? `api/regions/${countryId}` : "api/regions"),
  events: (query: Query = {}) => robotEventsJson<Paginated<Event>>("events", query),
  event: (id: string | number) => robotEventsJson<Event>(`events/${id}`),
  eventTeams: (id: string | number, query: Query = {}) => robotEventsJson<Paginated<Team>>(`events/${id}/teams`, query),
  eventMatches: (id: string | number, division: string | number, query: Query = {}) =>
    robotEventsJson<Paginated<Match>>(`events/${id}/divisions/${division}/matches`, query),
  eventRankings: (id: string | number, division: string | number, query: Query = {}) =>
    robotEventsJson<Paginated<Ranking>>(`events/${id}/divisions/${division}/rankings`, query),
  eventSkills: (id: string | number, query: Query = {}) => robotEventsJson<Paginated<Skill>>(`events/${id}/skills`, query),
  eventAwards: (id: string | number, query: Query = {}) => robotEventsJson<Paginated<Award>>(`events/${id}/awards`, query),
  robotEventsTeams: (query: Query = {}) => robotEventsJson<Paginated<Team>>("teams", query),
  teams: (query: Query = {}) => rseJson<Paginated<Team>>("teams", query),
  // `teams_light` is optimized for bulk lookups: it returns the *entire* matching
  // set as a flat, unpaginated array (sorted by team number) in a single request,
  // with a leaner record than `teams` (no location/grade/registered/robot_name).
  // We adapt it into the same `Paginated<Team>` shape the rest of the app expects,
  // synthesizing single-page meta so callers (caching, sorting, table) are unchanged.
  teamsLight: async (query: Query = {}): Promise<Paginated<Team>> => {
    const raw = await rseJson<TeamLight[]>("teams_light", query);
    const data: Team[] = raw.map((team) => ({
      id: team.team_id,
      number: team.team_num,
      team_name: team.team_name ?? null,
      robot_name: null,
      organization: team.org ?? null,
      location: null,
      registered: undefined,
      program: team.program,
      grade: null,
    }));
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
  team: (id: string | number) => robotEventsJson<Team>(`teams/${id}`),
  teamEvents: (id: string | number, query: Query = {}) => robotEventsJson<Paginated<Event>>(`teams/${id}/events`, query),
  teamMatches: (id: string | number, query: Query = {}) => robotEventsJson<Paginated<Match>>(`teams/${id}/matches`, query),
  teamRankings: (id: string | number, query: Query = {}) => robotEventsJson<Paginated<Ranking>>(`teams/${id}/rankings`, query),
  teamSkills: (id: string | number, query: Query = {}) => robotEventsJson<Paginated<Skill>>(`teams/${id}/skills`, query),
  teamAwards: (id: string | number, query: Query = {}) => robotEventsJson<Paginated<Award>>(`teams/${id}/awards`, query),
  eventInfo: (sku: string): Promise<EventInfoData> => {
    const params = new URLSearchParams({ sku });
    return dedupedJson<EventInfoData>(`/api/event-info?${params.toString()}`);
  },
  jumperPresetEventExists: (sku: string) => jumperJson<JumperPresetExists>("preset-event-exists", { sku }),
  jumperMatchTimestamps: (sku: string, query: Query = {}) => jumperJson<MatchTimestamp[]>("match-timestamp", { sku, ...query }),
  superscore: (program: "v5rc" | "viqrc", query: Query = {}) =>
    rseJson<Paginated<SuperscoreRow>>(`superscore/rankings/${program}`, query),
  worldSkills: (seasonId: string | number, grade: string) =>
    robotEventsRootJson<WorldSkillsEntry[]>(`api/seasons/${seasonId}/skills`, { post_season: 0, grade_level: grade }),
};
