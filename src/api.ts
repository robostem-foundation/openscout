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
  WorldSkillsEntry,
} from "./types";

type QueryValue = string | number | boolean | null | undefined;
type Query = Record<string, QueryValue | QueryValue[]>;

const jsonFrom = async <T>(source: "rse" | "re" | "re-root" | "jumper", path: string, query: Query = {}): Promise<T> => {
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

  const response = await fetch(`/api/${source}/${path}${params.size ? `?${params.toString()}` : ""}`);
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.message ?? `Request failed with ${response.status}`);
  }

  return payload as T;
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
  team: (id: string | number) => robotEventsJson<Team>(`teams/${id}`),
  teamEvents: (id: string | number, query: Query = {}) => robotEventsJson<Paginated<Event>>(`teams/${id}/events`, query),
  teamMatches: (id: string | number, query: Query = {}) => robotEventsJson<Paginated<Match>>(`teams/${id}/matches`, query),
  teamRankings: (id: string | number, query: Query = {}) => robotEventsJson<Paginated<Ranking>>(`teams/${id}/rankings`, query),
  teamSkills: (id: string | number, query: Query = {}) => robotEventsJson<Paginated<Skill>>(`teams/${id}/skills`, query),
  teamAwards: (id: string | number, query: Query = {}) => robotEventsJson<Paginated<Award>>(`teams/${id}/awards`, query),
  eventInfo: async (sku: string): Promise<EventInfoData> => {
    const params = new URLSearchParams({ sku });
    const response = await fetch(`/api/event-info?${params.toString()}`);
    if (!response.ok) throw new Error(`event-info failed with ${response.status}`);
    return response.json() as Promise<EventInfoData>;
  },
  jumperPresetEventExists: (sku: string) => jumperJson<JumperPresetExists>("preset-event-exists", { sku }),
  jumperMatchTimestamps: (sku: string, query: Query = {}) => jumperJson<MatchTimestamp[]>("match-timestamp", { sku, ...query }),
  superscore: (program: "v5rc" | "viqrc", query: Query = {}) =>
    rseJson<Paginated<SuperscoreRow>>(`superscore/rankings/${program}`, query),
  worldSkills: (seasonId: string | number, grade: string) =>
    robotEventsRootJson<WorldSkillsEntry[]>(`api/seasons/${seasonId}/skills`, { post_season: 0, grade_level: grade }),
};
