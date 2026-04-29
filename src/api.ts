import type {
  Award,
  Event,
  Match,
  Paginated,
  Program,
  Ranking,
  Season,
  Skill,
  SuperscoreRow,
  Team,
} from "./types";

type QueryValue = string | number | boolean | null | undefined;
type Query = Record<string, QueryValue | QueryValue[]>;

const jsonFrom = async <T>(source: "rse" | "re", path: string, query: Query = {}): Promise<T> => {
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

export const api = {
  programs: () => rseJson<Paginated<Program>>("programs", { per_page: 50 }),
  seasons: (query: Query = {}) => rseJson<Paginated<Season>>("seasons", { per_page: 50, ...query }),
  events: (query: Query = {}) => robotEventsJson<Paginated<Event>>("events", query),
  event: (id: string | number) => robotEventsJson<Event>(`events/${id}`),
  eventTeams: (id: string | number, query: Query = {}) => robotEventsJson<Paginated<Team>>(`events/${id}/teams`, query),
  eventMatches: (id: string | number, division: string | number, query: Query = {}) =>
    robotEventsJson<Paginated<Match>>(`events/${id}/divisions/${division}/matches`, query),
  eventRankings: (id: string | number, division: string | number, query: Query = {}) =>
    robotEventsJson<Paginated<Ranking>>(`events/${id}/divisions/${division}/rankings`, query),
  eventSkills: (id: string | number, query: Query = {}) => robotEventsJson<Paginated<Skill>>(`events/${id}/skills`, query),
  eventAwards: (id: string | number, query: Query = {}) => robotEventsJson<Paginated<Award>>(`events/${id}/awards`, query),
  teams: (query: Query = {}) => rseJson<Paginated<Team>>("teams", query),
  team: (id: string | number) => rseJson<Team>(`teams/${id}`),
  teamEvents: (id: string | number, query: Query = {}) => rseJson<Paginated<Event>>(`teams/${id}/events`, query),
  teamMatches: (id: string | number, query: Query = {}) => rseJson<Paginated<Match>>(`teams/${id}/matches`, query),
  teamRankings: (id: string | number, query: Query = {}) => rseJson<Paginated<Ranking>>(`teams/${id}/rankings`, query),
  teamSkills: (id: string | number, query: Query = {}) => rseJson<Paginated<Skill>>(`teams/${id}/skills`, query),
  teamAwards: (id: string | number, query: Query = {}) => rseJson<Paginated<Award>>(`teams/${id}/awards`, query),
  superscore: (program: "v5rc" | "viqrc", query: Query = {}) =>
    rseJson<Paginated<SuperscoreRow>>(`superscore/rankings/${program}`, query),
};
