import {
  Activity,
  Award as AwardIcon,
  BarChart3,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ExternalLink,
  Gamepad2,
  Info,
  ListFilter,
  Link as LinkIcon,
  Medal,
  PanelRight,
  Pause,
  Play,
  RotateCw,
  Search,
  Shield,
  Star,
  Trophy,
  Unlink,
  Users,
  Youtube,
} from "lucide-react";
import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, KeyboardEvent, MouseEvent, ReactNode, SetStateAction } from "react";
import { api } from "./api";
import type { Alliance, Award, CountryGroup, Event, IdInfo, JumperPresetExists, Match, MatchTimestamp, Paginated, Ranking, Season, Skill, Team, WorldSkillsEntry } from "./types";

const programOptions = [
  { label: "All Programs", value: "" },
  { label: "V5RC", value: "1" },
  { label: "VIQRC", value: "41" },
  { label: "VURC", value: "4" },
  { label: "VAIRC", value: "57" },
];

const today = new Date();
const oneDay = 24 * 60 * 60 * 1000;
const vexProgramIds = [1, 4, 41, 57];
const teamCacheRefreshMs = 24 * 60 * 60 * 1000;
const globalEventSearchCacheMs = 5 * 60 * 1000;
type EventCategory = "Worlds" | "Signature" | "Championship" | "Other";
type EventSort = "smart" | "date" | "type" | "name" | "program" | "location" | "past-season";
type EventWindow = "near" | "upcoming" | "next30" | "next90" | "past30" | "allSeason";
type EventFilterLayout = "sidebar" | "inline";
type RegionOptionKind = "country" | "subdivision" | "vex-region";
type DateDirection = "asc" | "desc";
type TeamDataKind = "matches" | "rankings" | "skills" | "awards";
type HomeEventTab = "popular" | "upcoming" | "today" | "signatures" | "near";
type AsyncBucket<T> = {
  data: T[];
  loading: boolean;
  error: string | null;
};
type HighlightAward = {
  award: Award;
  label: string;
  kind: "excellence" | "champions" | "skills";
};
type MatchPlayback = {
  match: Match;
  timestamp: MatchTimestamp;
};
type RegionOption = {
  key: string;
  kind: RegionOptionKind;
  label: string;
  badge: string;
  countryId?: number;
  countryName?: string;
  regionName?: string;
  vexLabel?: string;
};
type TeamCacheEntry = {
  data?: Paginated<Team>;
  updatedAt: number;
  promise?: Promise<Paginated<Team>>;
};

const teamListCache = new Map<string, TeamCacheEntry>();
let globalEventSearchCache: { data?: Event[]; updatedAt: number; promise?: Promise<Event[]> } = { updatedAt: 0 };

// World skills leaderboards are large (multi-MB) but change slowly, so cache the
// in-flight promise per season+grade for the whole session — subsequent team
// views in the same season reuse it instantly.
const worldSkillsCache = new Map<string, Promise<WorldSkillsEntry[]>>();
function loadWorldSkills(seasonId: number, grade: string) {
  const key = `${seasonId}:${grade}`;
  let promise = worldSkillsCache.get(key);
  if (!promise) {
    promise = api.worldSkills(seasonId, grade).catch((err: Error) => {
      worldSkillsCache.delete(key);
      throw err;
    });
    worldSkillsCache.set(key, promise);
  }
  return promise;
}

function emptyBucket<T>(): AsyncBucket<T> {
  return { data: [], loading: false, error: null };
}

function useRoute() {
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  return path;
}

function navigate(path: string) {
  window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

const allDigits = (value: string) => /^\d+$/.test(value);

// RobotEvents program ids → modern URL slug. The raw API `code` is the legacy
// abbreviation (e.g. "VRC"/"VIQC"), so we key off the stable program id and use
// the rebranded name users expect in URLs. Falls back to the raw code.
const PROGRAM_SLUGS: Record<number, string> = { 1: "V5RC", 4: "VURC", 41: "VIQRC" };

const programSlug = (program?: { id?: number; code?: string | null } | null) =>
  (program?.id != null ? PROGRAM_SLUGS[program.id] : undefined) ?? program?.code?.toUpperCase() ?? "";

const programMatchesSlug = (program: { id?: number; code?: string | null } | null | undefined, slug: string) => {
  const target = slug.toUpperCase();
  return programSlug(program) === target || program?.code?.toUpperCase() === target;
};

const eventPath = (event: { sku?: string | null; id: number }) => `/event/${event.sku || event.id}`;

// Builds a team URL from a program slug + number, falling back to bare number or
// numeric id when the program isn't known. Used both by teamPath (full objects)
// and by IdInfo-only links via ProgramContext.
const teamSlugPath = (programCode: string | undefined, number?: string | null, id?: number | string) =>
  programCode && number ? `/team/${programCode}/${number}` : `/team/${number || id}`;

const teamPath = (team: { program?: { id?: number; code?: string | null } | null; number?: string | null; id: number }) =>
  teamSlugPath(programSlug(team.program), team.number, team.id);

// Provided by program-scoped pages (event/team/insights) so that team links
// which only carry an IdInfo (id + number, no program) can still build the
// modern /team/{PROGRAM}/{number} URL.
const ProgramContext = createContext<string | undefined>(undefined);

function Link({
  href,
  children,
  className,
  onClick,
}: {
  href: string;
  children: ReactNode;
  className?: string;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  return (
    <a
      href={href}
      className={className}
      onClick={(event) => {
        onClick?.(event);
        if (href.startsWith("/")) {
          event.preventDefault();
          navigate(href);
        }
      }}
    >
      {children}
    </a>
  );
}

function useAsync<T>(loader: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);

    loader()
      .then((value) => {
        if (live) setData(value);
      })
      .catch((err: Error) => {
        if (live) setError(err.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });

    return () => {
      live = false;
    };
  }, deps);

  return { data, error, loading };
}

function useDebouncedValue<T>(value: T, delay = 250) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedValue(value), delay);
    return () => window.clearTimeout(timeout);
  }, [value, delay]);

  return debouncedValue;
}

async function loadGlobalEventSearchEvents() {
  const now = Date.now();
  if (globalEventSearchCache.data && now - globalEventSearchCache.updatedAt < globalEventSearchCacheMs) {
    return globalEventSearchCache.data;
  }
  if (globalEventSearchCache.promise) return globalEventSearchCache.promise;

  const promise = collectAllPages<Event>((page) =>
    api.events({
      per_page: 250,
      page,
      start: dateOnly(addDays(today, -90)),
      end: dateOnly(addDays(today, 365)),
      "program[]": vexProgramIds,
    }),
  ).then((result) => {
    globalEventSearchCache = { data: result.data, updatedAt: Date.now() };
    return result.data;
  });

  globalEventSearchCache = { ...globalEventSearchCache, promise };

  try {
    return await promise;
  } catch (error) {
    globalEventSearchCache = { data: globalEventSearchCache.data, updatedAt: globalEventSearchCache.updatedAt };
    throw error;
  }
}

function GlobalSearch({ className = "" }: { className?: string }) {
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query.trim(), 220);
  const [open, setOpen] = useState(false);

  // Teams results
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(false);

  // Events results
  const [events, setEvents] = useState<Event[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);

  const wrapRef = useRef<HTMLDivElement>(null);

  // Fire both searches independently when debounced query changes
  useEffect(() => {
    if (!debounced) {
      setTeams([]);
      setEvents([]);
      setTeamsLoading(false);
      setEventsLoading(false);
      return;
    }

    let live = true;

    setTeamsLoading(true);
    Promise.all([
      api.teams({ teamSearch: debounced, per_page: 50 }),
      /^\d+[a-z]?$/i.test(debounced) ? api.robotEventsTeams({ number: debounced, "program[]": vexProgramIds, per_page: 20 }) : Promise.resolve(null),
    ])
      .then(([rseTeams, exactTeams]) => {
        if (!live) return;
        setTeams(rankTeamsForSearch(uniqueTeams([...(exactTeams?.data ?? []), ...rseTeams.data]), debounced).slice(0, 5));
      })
      .catch(() => { if (live) setTeams([]); })
      .finally(() => { if (live) setTeamsLoading(false); });

    setEventsLoading(true);
    loadGlobalEventSearchEvents()
      .then((searchEvents) => {
        if (!live) return;
        setEvents(filterAndSortEvents(searchEvents, { search: debounced, hideCanceled: true, sort: "smart" }).slice(0, 5));
      })
      .catch(() => { if (live) setEvents([]); })
      .finally(() => { if (live) setEventsLoading(false); });

    return () => { live = false; };
  }, [debounced]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: globalThis.MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const searchTerm = query.trim();
  const showDropdown = open && !!searchTerm;

  const handleSelect = useCallback((href: string) => {
    setOpen(false);
    setQuery("");
    navigate(href);
  }, []);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") setOpen(false);
    if (e.key === "Enter") {
      e.preventDefault();
      if (query.trim()) {
        setOpen(false);
        navigate(`/events?search=${encodeURIComponent(query.trim())}`);
      }
    }
  };

  return (
    <div className={`global-search-wrap ${className}`.trim()} ref={wrapRef}>
      <div className="global-search-input-row">
        <Search size={16} className="global-search-icon" />
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search teams or events..."
          className="global-search-input"
        />
      </div>

      {showDropdown && (
        <div className="global-search-dropdown">
          {/* Teams section */}
          <div className="gs-section-label">Teams</div>
          {teamsLoading && !teams.length && (
            <div className="gs-loading">Loading...</div>
          )}
          {teams.map((team) => (
            <button
              key={team.id}
              type="button"
              className="gs-result"
              onMouseDown={() => handleSelect(teamPath(team))}
            >
              <span className="gs-result-main">{team.number} - {team.team_name ?? "Unnamed Team"}</span>
              <span className="gs-result-sub">{locationLine(team)}</span>
            </button>
          ))}
          {!teamsLoading && !teams.length && (
            <div className="gs-empty">No teams found.</div>
          )}
          <button
            type="button"
            className="gs-find-more"
            onMouseDown={() => handleSelect(`/teams?search=${encodeURIComponent(searchTerm)}`)}
          >
            Find more teams...
          </button>

          {/* Events section */}
          <div className="gs-section-label">Events</div>
          {eventsLoading && !events.length && (
            <div className="gs-loading">Loading...</div>
          )}
          {events.map((event) => (
            <button
              key={event.id}
              type="button"
              className="gs-result"
              onMouseDown={() => handleSelect(eventPath(event))}
            >
              <span className="gs-result-main">{event.name}</span>
              <span className="gs-result-sub">{event.sku} · {locationLine(event)}</span>
            </button>
          ))}
          {!eventsLoading && !events.length && (
            <div className="gs-empty">No events found.</div>
          )}
          <button
            type="button"
            className="gs-find-more"
            onMouseDown={() => handleSelect(`/events?search=${encodeURIComponent(searchTerm)}`)}
          >
            Find more events...
          </button>
        </div>
      )}
    </div>
  );
}

async function collectAllPages<T>(loader: (page: number) => Promise<Paginated<T>>) {
  const first = await loader(1);
  const extraPages = Array.from({ length: Math.max(0, first.meta.last_page - 1) }, (_, index) => index + 2);
  const rest: Paginated<T>[] = [];

  for (let index = 0; index < extraPages.length; index += 8) {
    const batch = extraPages.slice(index, index + 8);
    rest.push(...(await Promise.all(batch.map((page) => loader(page)))));
  }

  return {
    ...first,
    data: [first, ...rest].flatMap((page) => page.data),
  };
}

function cachedTeamsKey(program: string, registered: string) {
  return JSON.stringify({ program, registered });
}

// The full team list for one program is large (~6 MB for V5RC), which exceeds
// the localStorage quota. IndexedDB persists it across reloads so the cached
// list shows instantly instead of re-fetching every page load.
const TEAMS_DB_NAME = "vex-teams-cache";
const TEAMS_STORE = "teams";
let teamsDbPromise: Promise<IDBDatabase> | null = null;

function openTeamsDb(): Promise<IDBDatabase> {
  if (teamsDbPromise) return teamsDbPromise;
  teamsDbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(TEAMS_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(TEAMS_STORE)) db.createObjectStore(TEAMS_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return teamsDbPromise;
}

async function idbGetTeams(key: string): Promise<{ data: Paginated<Team>; updatedAt: number } | undefined> {
  try {
    const db = await openTeamsDb();
    return await new Promise((resolve, reject) => {
      const request = db.transaction(TEAMS_STORE, "readonly").objectStore(TEAMS_STORE).get(key);
      request.onsuccess = () => resolve(request.result as { data: Paginated<Team>; updatedAt: number } | undefined);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return undefined;
  }
}

async function idbSetTeams(key: string, entry: { data: Paginated<Team>; updatedAt: number }): Promise<void> {
  try {
    const db = await openTeamsDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(TEAMS_STORE, "readwrite");
      tx.objectStore(TEAMS_STORE).put({ data: entry.data, updatedAt: entry.updatedAt }, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Storage may be unavailable (private mode / quota) — fall back to in-memory only.
  }
}

async function loadCachedTeams(cacheKey: string, query: Parameters<typeof api.teams>[0], force = false) {
  const cached = teamListCache.get(cacheKey);
  if (!force && cached?.promise) return cached.promise;

  const promise = collectAllPages<Team>((page) => api.teams({ ...query, page })).then((result) => {
    const sortedResult = { ...result, data: [...result.data].sort(compareTeamsNatural) };
    const updatedAt = Date.now();
    teamListCache.set(cacheKey, { data: sortedResult, updatedAt });
    void idbSetTeams(cacheKey, { data: sortedResult, updatedAt });
    return sortedResult;
  });

  teamListCache.set(cacheKey, { data: cached?.data, updatedAt: cached?.updatedAt ?? 0, promise });

  try {
    return await promise;
  } catch (error) {
    if (cached?.data) {
      teamListCache.set(cacheKey, cached);
    } else {
      teamListCache.delete(cacheKey);
    }
    throw error;
  }
}

function formatDate(value?: string | null) {
  if (!value) return "TBD";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function formatEventDateRange(start?: string | null, end?: string | null) {
  const startLabel = formatDate(start);
  const endLabel = formatDate(end);
  return startLabel === endLabel ? startLabel : `${startLabel} - ${endLabel}`;
}

function formatNumber(value?: number | null, digits = 1) {
  if (value === undefined || value === null || Number.isNaN(value)) return "-";
  return value.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function formatRelativeTime(timestamp: number) {
  const diff = Date.now() - timestamp;
  if (diff < 60_000) return "just now";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function locationLine(eventOrTeam: { location?: Event["location"] | Team["location"] }) {
  const location = eventOrTeam.location;
  if (!location) return "Unknown location";
  return [location.city, location.region, location.country].filter(Boolean).join(", ") || location.venue || "Unknown location";
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * oneDay);
}

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function normalizeText(value?: string | null) {
  return (value ?? "").trim().toLowerCase();
}

function eventCategory(event: Event): { label: EventCategory; rank: number } {
  const robotEventsType = event.level ?? event.event_type ?? "";

  if (robotEventsType === "World") return { label: "Worlds", rank: 0 };
  if (robotEventsType === "Signature") return { label: "Signature", rank: 1 };
  if (robotEventsType === "National" || robotEventsType === "State" || robotEventsType === "Regional") return { label: "Championship", rank: 2 };

  return { label: "Other", rank: 3 };
}

// Scrimmages are practice events that shouldn't count toward performance trends.
function isScrimmageEvent(event?: Event | null) {
  if (!event) return false;
  if (normalizeText(event.event_type).includes("scrimmage")) return true;
  return normalizeText(event.name).includes("scrimmage");
}

// Signature events and championships (incl. Worlds) get a star marker on charts.
function isMarqueeEvent(event?: Event | null) {
  return event ? eventCategory(event).label !== "Other" : false;
}

function eventDistance(event: Event) {
  const start = new Date(event.start ?? 0).getTime();
  const end = new Date(event.end ?? event.start ?? 0).getTime();
  const now = today.getTime();
  if (start <= now && now <= end + oneDay) return 0;
  return Math.min(Math.abs(start - now), Math.abs(end - now));
}

function compareEvents(a: Event, b: Event, sort: EventSort) {
  const aCategory = eventCategory(a);
  const bCategory = eventCategory(b);

  if (sort === "smart") {
    return (
      aCategory.rank - bCategory.rank ||
      eventDistance(a) - eventDistance(b) ||
      new Date(a.start ?? 0).getTime() - new Date(b.start ?? 0).getTime() ||
      a.name.localeCompare(b.name)
    );
  }

  if (sort === "type") return aCategory.rank - bCategory.rank || a.name.localeCompare(b.name);
  if (sort === "name") return a.name.localeCompare(b.name);
  if (sort === "program") return (a.program.code ?? "").localeCompare(b.program.code ?? "") || a.name.localeCompare(b.name);
  if (sort === "location") return locationLine(a).localeCompare(locationLine(b)) || a.name.localeCompare(b.name);
  if (sort === "past-season") {
    return (
      aCategory.rank - bCategory.rank ||
      new Date(b.start ?? 0).getTime() - new Date(a.start ?? 0).getTime() ||
      a.name.localeCompare(b.name)
    );
  }

  return new Date(a.start ?? 0).getTime() - new Date(b.start ?? 0).getTime() || aCategory.rank - bCategory.rank;
}

function compareEventsChronological(a?: Event, b?: Event) {
  const aTime = new Date(a?.start ?? 0).getTime();
  const bTime = new Date(b?.start ?? 0).getTime();
  return aTime - bTime || (a?.name ?? "").localeCompare(b?.name ?? "");
}

function compareEventsByDirection(direction: DateDirection) {
  return (a?: Event, b?: Event) => (direction === "asc" ? 1 : -1) * compareEventsChronological(a, b);
}

function sameNumberSet(a: number[], b: number[]) {
  if (a.length !== b.length) return false;
  const values = new Set(a);
  return b.every((value) => values.has(value));
}

function teamNumberParts(number?: string) {
  const match = (number ?? "").trim().match(/^(\d+)(.*)$/);
  return {
    numeric: match ? Number(match[1]) : Number.MAX_SAFE_INTEGER,
    suffix: (match?.[2] ?? number ?? "").toUpperCase(),
  };
}

function compareTeamsNatural(a: Team, b: Team) {
  const aNumber = teamNumberParts(a.number);
  const bNumber = teamNumberParts(b.number);
  return (
    aNumber.numeric - bNumber.numeric ||
    aNumber.suffix.localeCompare(bNumber.suffix, undefined, { numeric: true }) ||
    (a.team_name ?? "").localeCompare(b.team_name ?? "") ||
    a.number.localeCompare(b.number, undefined, { numeric: true })
  );
}

function normalizedTeamQuery(query: string) {
  return query.trim().toUpperCase().replace(/\s+/g, "");
}

function teamSearchRank(team: Team, query: string) {
  const needle = normalizedTeamQuery(query);
  if (!needle) return 0;
  const teamNumber = normalizedTeamQuery(team.number);
  const numericNeedle = /^\d+$/.test(needle);
  const numberParts = teamNumberParts(team.number);

  if (teamNumber === needle) return 0;
  if (numericNeedle && String(numberParts.numeric) === needle) return 1;
  if (teamNumber.startsWith(needle)) return 2;
  if (teamNumber.includes(needle)) return 3;

  const text = [team.team_name, team.organization, team.grade, team.program?.name, team.program?.code, locationLine(team)]
    .filter(Boolean)
    .join(" ")
    .toUpperCase();
  if (text.includes(needle)) return 4;
  return 5;
}

function compareTeamsForSearch(query: string) {
  return (a: Team, b: Team) => teamSearchRank(a, query) - teamSearchRank(b, query) || compareTeamsNatural(a, b);
}

function rankTeamsForSearch(teams: Team[], query: string) {
  return [...teams].sort(compareTeamsForSearch(query));
}

function uniqueTeams(teams: Team[]) {
  const seen = new Set<number>();
  return teams.filter((team) => {
    if (seen.has(team.id)) return false;
    seen.add(team.id);
    return true;
  });
}

function gradeCode(grade?: string | null) {
  const value = (grade ?? "").toLowerCase();
  if (value.includes("elementary")) return "ES";
  if (value.includes("middle")) return "MS";
  if (value.includes("high")) return "HS";
  return grade || "-";
}

function eventGradeCode(event: Event): "HS" | "MS" | "ES" | "All" {
  const name = event.name ?? "";
  if (/high\s*school/i.test(name)) return "HS";
  if (/middle\s*school/i.test(name)) return "MS";
  if (/elementary/i.test(name)) return "ES";
  return "All";
}

function optionKey(kind: RegionOptionKind, id: string | number) {
  return `${kind}:${id}`;
}

function dedupeCountryGroups(groups: CountryGroup[]) {
  const countries = new Map<number, CountryGroup["options"][number]>();
  groups.forEach((group) => group.options.forEach((country) => countries.set(country.value, country)));
  return [...countries.values()].sort((a, b) => a.label.localeCompare(b.label));
}

function derivedVexRegionLabels(event: Event) {
  const labels = new Set<string>();
  const candidates = [event.name, event.location.region, event.location.country].filter(Boolean).join(" ");
  const patterns = [
    /\b([A-Z][A-Za-z .'-]{2,}?)\s*[-–]\s*(Region\s*\d+|North|South|East|West|Central|Northeast|Northwest|Southeast|Southwest)\b/g,
    /\b([A-Z][A-Za-z .'-]{2,}?)\s+(Region\s*\d+)\b/g,
  ];

  patterns.forEach((pattern) => {
    for (const match of candidates.matchAll(pattern)) {
      const place = match[1].replace(/\s+/g, " ").trim();
      const area = match[2].replace(/\s+/g, " ").trim();
      if (place && area && place.length <= 40) labels.add(`${place} - ${area}`);
    }
  });

  return [...labels];
}

function eventMatchesRegionOption(event: Event, option: RegionOption) {
  const country = normalizeText(event.location.country);
  const region = normalizeText(event.location.region);

  if (option.kind === "country") return country === normalizeText(option.countryName);
  if (option.kind === "subdivision") {
    const countryMatches = !option.countryName || country === normalizeText(option.countryName);
    return countryMatches && region === normalizeText(option.regionName);
  }
  return derivedVexRegionLabels(event).some((label) => normalizeText(label) === normalizeText(option.vexLabel));
}

function eventMatchesRegionOptions(event: Event, options: RegionOption[]) {
  if (!options.length) return true;
  return options.some((option) => eventMatchesRegionOption(event, option));
}

function teamMatchesRegionOption(team: Team, option: RegionOption) {
  const country = normalizeText(team.location?.country);
  const region = normalizeText(team.location?.region);

  if (option.kind === "country") return country === normalizeText(option.countryName);
  if (option.kind === "subdivision") {
    const countryMatches = !option.countryName || country === normalizeText(option.countryName);
    return countryMatches && region === normalizeText(option.regionName);
  }
  return region === normalizeText(option.vexLabel);
}

function teamMatchesRegionOptions(team: Team, options: RegionOption[]) {
  if (!options.length) return true;
  return options.some((option) => teamMatchesRegionOption(team, option));
}

function shortSeasonName(name?: string | null) {
  if (!name) return "Unknown Season";
  return name.split(":").pop()?.trim() || name;
}

function makeEventIndex(events: Event[]) {
  return new Map(events.map((event) => [event.id, event]));
}

function awardPriority(award: Award) {
  if (/excellence/i.test(award.title)) return 0;
  if (/world champions|tournament champions|teamwork challenge world champions|event champions/i.test(award.title)) return 1;
  if (/finalists/i.test(award.title)) return 2;
  if (/robot skills world champions|skills champions/i.test(award.title)) return 3;
  return 4;
}

function sortAwards(awards: Award[]) {
  return [...awards].sort((a, b) => awardPriority(a) - awardPriority(b) || a.title.localeCompare(b.title));
}

function awardTeamWinners(award: Award) {
  const value = award.teamWinners as unknown;
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    return Object.values(value).filter((winner): winner is NonNullable<Award["teamWinners"]>[number] => {
      return !!winner && typeof winner === "object" && "team" in winner;
    });
  }
  return [];
}

function awardIndividualWinners(award: Award) {
  const value = award.individualWinners as unknown;
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") return [value];
  if (value && typeof value === "object") return Object.values(value).map(String);
  return [];
}

function isIqProgramInfo(program?: { id?: number; code?: string | null; name?: string | null } | null) {
  if (!program) return false;
  if (program.id === 41) return true;
  return /VIQ|IQ/i.test(`${program.code ?? ""} ${program.name ?? ""}`);
}

function isIqProgram(event?: Event | null) {
  return isIqProgramInfo(event?.program);
}

const IQ_FINALS_ROUND = 15;

function isIqFinalsMatch(match: Match) {
  return match.round === IQ_FINALS_ROUND;
}

// In IQ Teamwork, the two partner teams share one score. They normally match;
// if they differ, the lower/zero side's team was disqualified.
function iqMatchResult(match: Match): { score: number | null; dqColor: string | null } {
  const red = match.alliances.find((alliance) => alliance.color === "red");
  const blue = match.alliances.find((alliance) => alliance.color === "blue");
  const r = red?.score;
  const b = blue?.score;
  if (r === null || r === undefined) {
    if (b === null || b === undefined) return { score: null, dqColor: null };
  }
  const rv = r ?? 0;
  const bv = b ?? 0;
  const bothScored = r !== null && r !== undefined && b !== null && b !== undefined;
  const dqColor = bothScored && rv !== bv ? (rv < bv ? "red" : "blue") : null;
  return { score: Math.max(rv, bv), dqColor };
}

function iqDropCount(played: number) {
  if (played < 4) return 0;
  if (played < 8) return 1;
  if (played < 12) return 2;
  return 3;
}

// Compute a team's IQ ranking stats from its qualification matches. Avg/High are
// taken from the API ranking when available; Low (lowest kept) and the dropped
// scores are derived from the team's own per-match scores using the drop rule.
function iqTeamQualStats(qualMatches: Match[], teamId: number, ranking?: Ranking | null) {
  const scores: Array<{ matchnum: number; score: number }> = [];
  qualMatches
    .filter((match) => match.round === 2)
    .forEach((match) => {
      const alliance = match.alliances.find((entry) => isTeamInAlliance(entry, teamId));
      if (!alliance || alliance.score === null || alliance.score === undefined) return;
      scores.push({ matchnum: match.matchnum, score: alliance.score });
    });
  const played = scores.length;
  const sorted = [...scores].sort((a, b) => a.score - b.score || a.matchnum - b.matchnum);
  const dropCount = Math.min(iqDropCount(played), played);
  const dropped = sorted.slice(0, dropCount);
  const kept = sorted.slice(dropCount);
  const allScores = scores.map((entry) => entry.score);
  const high = ranking?.high_score ?? (allScores.length ? Math.max(...allScores) : null);
  const low = kept.length ? Math.min(...kept.map((entry) => entry.score)) : null;
  const avg =
    ranking?.average_points ?? (kept.length ? kept.reduce((sum, entry) => sum + entry.score, 0) / kept.length : null);
  return { played, high, low, avg, dropped };
}

// IQ alliances are the partner pairs that appear in the finals, seeded by their
// finals score (descending). Tiebreaker replays of the same pair are de-duped.
function iqFinalsAlliances(matches: Match[]): Array<[number, string[]]> {
  const byPair = new Map<string, { teams: string[]; score: number }>();
  matches
    .filter((match) => isIqFinalsMatch(match))
    .forEach((match) => {
      const red = match.alliances.find((alliance) => alliance.color === "red");
      const blue = match.alliances.find((alliance) => alliance.color === "blue");
      const teams = [
        ...(red?.teams.map((entry) => entry.team.name) ?? []),
        ...(blue?.teams.map((entry) => entry.team.name) ?? []),
      ].filter(Boolean);
      if (!teams.length) return;
      const score = Math.max(red?.score ?? 0, blue?.score ?? 0);
      const key = [...teams].sort().join("|");
      const existing = byPair.get(key);
      if (!existing || score > existing.score) byPair.set(key, { teams, score });
    });
  return [...byPair.values()]
    .sort((a, b) => b.score - a.score)
    .map((row, index) => [index + 1, row.teams] as [number, string[]]);
}

// Label finals matches "Finals 1", "Finals 2"... in order; a repeat of the same
// pair (a replay) is labeled "Tiebreaker".
function iqFinalsLabels(matches: Match[]): Map<number, string> {
  const labels = new Map<number, string>();
  const seen = new Set<string>();
  let counter = 0;
  matches
    .filter((match) => isIqFinalsMatch(match))
    .sort((a, b) => (a.instance ?? 0) - (b.instance ?? 0) || a.matchnum - b.matchnum)
    .forEach((match) => {
      const teams = match.alliances.flatMap((alliance) => alliance.teams.map((entry) => entry.team.name)).filter(Boolean);
      const key = [...teams].sort().join("|");
      if (seen.has(key)) {
        labels.set(match.id, "Tiebreaker");
      } else {
        seen.add(key);
        counter += 1;
        labels.set(match.id, `Finals ${counter}`);
      }
    });
  return labels;
}

// For a team's IQ event: its finals partner pair (red team first) and seed.
function iqTeamFinals(matches: Match[], teamId: number) {
  const finals = matches
    .filter((match) => isIqFinalsMatch(match))
    .sort((a, b) => (a.instance ?? 0) - (b.instance ?? 0) || a.matchnum - b.matchnum);
  const match = finals.find((entry) => entry.alliances.some((alliance) => isTeamInAlliance(alliance, teamId)));
  if (!match) return null;
  const red = match.alliances.find((alliance) => alliance.color === "red");
  const blue = match.alliances.find((alliance) => alliance.color === "blue");
  const teams = [...(red?.teams.map((entry) => entry.team) ?? []), ...(blue?.teams.map((entry) => entry.team) ?? [])];
  if (!teams.length) return null;
  const key = [...teams.map((team) => team.name)].sort().join("|");
  const ranked = iqFinalsAlliances(matches);
  const seedEntry = ranked.find(([, names]) => [...names].sort().join("|") === key);
  return { seed: seedEntry?.[0] ?? null, teams };
}

function highlightAwards(awards: Award[], event?: Event | null): HighlightAward[] {
  const hasWinners = (award: Award) => awardTeamWinners(award).length > 0 || awardIndividualWinners(award).length > 0;
  const titleMatches = (pattern: RegExp) => awards.find((award) => pattern.test(award.title) && hasWinners(award));
  const excellence = titleMatches(/excellence award/i);
  const champions = titleMatches(isIqProgram(event) ? /teamwork.*champions?/i : /tournament champions?|event champions?/i);
  const skills = titleMatches(/(?:robot\s*)?skills?.*champions?/i);
  const highlights: HighlightAward[] = [];

  if (excellence) highlights.push({ award: excellence, label: "Excellence Award", kind: "excellence" });
  if (champions) highlights.push({ award: champions, label: isIqProgram(event) ? "Teamwork Champions" : "Tournament Champions", kind: "champions" });
  if (skills) highlights.push({ award: skills, label: "Robot Skills Champion", kind: "skills" });

  return highlights;
}

function jumperPresetName(event: Event, preset?: JumperPresetExists | null) {
  return preset?.preset ?? preset?.presetName ?? preset?.preset_name ?? preset?.sku ?? event.sku;
}

let ytApiLoaded = false;
let ytApiReady = false;
const ytReadyCallbacks: Array<() => void> = [];

function loadYouTubeApi() {
  if (ytApiLoaded) return;
  ytApiLoaded = true;
  const tag = document.createElement("script");
  tag.src = "https://www.youtube.com/iframe_api";
  document.head.appendChild(tag);
  (window as unknown as Record<string, unknown>).onYouTubeIframeAPIReady = () => {
    ytApiReady = true;
    ytReadyCallbacks.forEach((cb) => cb());
    ytReadyCallbacks.length = 0;
  };
}

function onYtApiReady(cb: () => void) {
  if (ytApiReady) {
    cb();
  } else {
    ytReadyCallbacks.push(cb);
    loadYouTubeApi();
  }
}

function matchWinner(match: Match) {
  const red = match.alliances.find((alliance) => alliance.color === "red");
  const blue = match.alliances.find((alliance) => alliance.color === "blue");
  const redScore = red?.score;
  const blueScore = blue?.score;
  const hasScore = redScore !== null && redScore !== undefined && blueScore !== null && blueScore !== undefined;

  if (!hasScore) return { red, blue, redScore, blueScore, winner: "-" };
  if (redScore === blueScore) return { red, blue, redScore, blueScore, winner: "Tie" };
  return { red, blue, redScore, blueScore, winner: redScore > blueScore ? "Red" : "Blue" };
}

function playoffRoundKey(match: Match) {
  if (/^R16\b/i.test(match.name)) return "r16";
  if (/^QF\b/i.test(match.name)) return "qf";
  if (/^SF\b/i.test(match.name)) return "sf";
  if (/^Final\b/i.test(match.name)) return "f";
  return `round-${match.round}`;
}

function playoffRoundLabel(key: string) {
  if (key === "r16") return "Round of 16 (R16)";
  if (key === "qf") return "Quarterfinals (QF)";
  if (key === "sf") return "Semifinals (SF)";
  if (key === "f") return "Finals (F)";
  return "Playoffs";
}

function matchRoundOrder(match: Match) {
  if (/practice/i.test(match.name)) return 0;
  if (/qual/i.test(match.name) || match.round === 2) return 1;
  const key = playoffRoundKey(match);
  if (key === "r16") return 2;
  if (key === "qf") return 3;
  if (key === "sf") return 4;
  if (key === "f") return 5;
  return 6 + Math.max(0, match.round ?? 0);
}

function compareMatchesDisplay(a: Match, b: Match, preferredDivisionId?: number | null) {
  const aPreferred = preferredDivisionId && a.division?.id === preferredDivisionId ? 0 : 1;
  const bPreferred = preferredDivisionId && b.division?.id === preferredDivisionId ? 0 : 1;
  return (
    aPreferred - bPreferred ||
    matchRoundOrder(a) - matchRoundOrder(b) ||
    (a.instance ?? 0) - (b.instance ?? 0) ||
    a.matchnum - b.matchnum ||
    (a.division?.name ?? "").localeCompare(b.division?.name ?? "") ||
    a.name.localeCompare(b.name)
  );
}

function matchTimestampMs(match: Match) {
  const value = match.scheduled ?? match.started;
  return value ? new Date(value).getTime() || 0 : 0;
}

function formatMatchClock(match: Match) {
  const value = match.scheduled ?? match.started;
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(date);
}

function matchDayKey(match: Match) {
  const value = match.scheduled ?? match.started;
  if (!value) return null;
  const isoDate = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return isoDate ? isoDate[1] : null;
}

function uniqueMatches(matches: Match[]) {
  const seen = new Set<number>();
  return matches.filter((match) => {
    if (seen.has(match.id)) return false;
    seen.add(match.id);
    return true;
  });
}

function preferredTeamDivisionId(matches: Match[], teamId: number) {
  const divisionCounts = new Map<number, number>();
  matches
    .filter((match) => match.round === 2 || /qual/i.test(match.name))
    .forEach((match) => {
      if (!match.alliances.some((alliance) => isTeamInAlliance(alliance, teamId))) return;
      divisionCounts.set(match.division.id, (divisionCounts.get(match.division.id) ?? 0) + 1);
    });
  return [...divisionCounts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? null;
}

const r16SeedPairs = [
  [1, 16],
  [8, 9],
  [4, 13],
  [5, 12],
  [2, 15],
  [7, 10],
  [3, 14],
  [6, 11],
];

function allianceRowsFromMatches(matches: Match[]) {
  const rows = new Map<number, string[]>();

  matches
    .filter((match) => playoffRoundKey(match) === "r16")
    .sort((a, b) => (a.instance ?? 0) - (b.instance ?? 0) || a.matchnum - b.matchnum)
    .forEach((match) => {
      const seedPair = r16SeedPairs[(match.instance ?? 1) - 1];
      if (!seedPair) return;
      const redTeams = match.alliances.find((alliance) => alliance.color === "red")?.teams.map((entry) => entry.team.name).filter(Boolean) ?? [];
      const blueTeams = match.alliances.find((alliance) => alliance.color === "blue")?.teams.map((entry) => entry.team.name).filter(Boolean) ?? [];
      rows.set(seedPair[0], redTeams);
      rows.set(seedPair[1], blueTeams);
    });

  return [...rows.entries()].sort((a, b) => a[0] - b[0]);
}

function groupItemsByEvent<T extends { event: { id: number; name: string } }>(
  items: T[],
  eventIndex: Map<number, Event>,
  seasonId: number | null,
  direction: DateDirection = "asc",
) {
  const groups = new Map<number, { eventRef: T["event"]; event?: Event; items: T[] }>();

  items.forEach((item) => {
    const event = eventIndex.get(item.event.id);
    if (seasonId && event?.season.id !== seasonId) return;

    const group: { eventRef: T["event"]; event?: Event; items: T[] } = groups.get(item.event.id) ?? { eventRef: item.event, event, items: [] };
    group.items.push(item);
    groups.set(item.event.id, group);
  });

  return [...groups.values()].sort((a, b) => compareEventsByDirection(direction)(a.event, b.event));
}

function filterAndSortEvents(events: Event[], options: {
  search?: string;
  programIds?: string[];
  level?: string;
  regionOptions?: RegionOption[];
  seasonIds?: number[];
  hideCanceled?: boolean;
  sort?: EventSort;
  grades?: string[];
}) {
  const needle = (options.search ?? "").trim().toLowerCase();
  const seasonIds = options.seasonIds ?? [];
  const programIds = options.programIds ?? [];
  const grades = options.grades ?? [];

  return events
    .filter((event) => {
      const haystack = [
        event.name,
        event.sku,
        event.level,
        event.event_type,
        event.program.code,
        event.program.name,
        event.season.name,
        event.location.venue,
        event.location.city,
        event.location.region,
        event.location.country,
        event.location.postcode,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (needle && !haystack.includes(needle)) return false;
      if (programIds.length && !programIds.includes(String(event.program.id))) return false;
      if (seasonIds.length && !seasonIds.includes(event.season.id)) return false;
      if (options.level) {
        if (options.level === "Championship" && eventCategory(event).label !== "Championship") return false;
        if (options.level === "Other" && eventCategory(event).label !== "Other") return false;
        if (options.level !== "Championship" && options.level !== "Other" && event.level !== options.level) return false;
      }
      if (!eventMatchesRegionOptions(event, options.regionOptions ?? [])) return false;
      if (options.hideCanceled && /cancel+ed|canceled/i.test(event.name)) return false;
      if (grades.length && !grades.includes(eventGradeCode(event))) return false;
      return vexProgramIds.includes(event.program.id);
    })
    .sort((a, b) => compareEvents(a, b, options.sort ?? "smart"));
}

function eventWindowDates(eventWindow: EventWindow) {
  if (eventWindow === "upcoming") return { start: dateOnly(today), end: undefined };
  if (eventWindow === "next30") return { start: dateOnly(today), end: dateOnly(addDays(today, 30)) };
  if (eventWindow === "next90") return { start: dateOnly(today), end: dateOnly(addDays(today, 90)) };
  if (eventWindow === "past30") return { start: dateOnly(addDays(today, -30)), end: dateOnly(today) };
  if (eventWindow === "allSeason") return { start: undefined, end: undefined };
  return { start: dateOnly(addDays(today, -30)), end: dateOnly(addDays(today, 120)) };
}

function Empty({ children = "No data returned." }: { children?: ReactNode }) {
  return <div className="empty">{children}</div>;
}

function LoadingTable({ columns = 4 }: { columns?: number }) {
  return (
    <tbody>
      {Array.from({ length: 5 }).map((_, row) => (
        <tr key={row}>
          {Array.from({ length: columns }).map((__, col) => (
            <td key={col}>
              <span className="skeleton" />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}

function Status({ loading, error }: { loading: boolean; error: string | null }) {
  if (loading) return <div className="notice">Loading competition data...</div>;
  if (error) return <div className="notice error">API error: {error}</div>;
  return null;
}

function LocalPager({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (page: number) => void }) {
  if (totalPages <= 1) return null;

  return (
    <div className="pager">
      <button disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
        <ChevronLeft size={16} />
      </button>
      <span>
        Page {page.toLocaleString()} of {totalPages.toLocaleString()}
      </span>
      <button disabled={page >= totalPages} onClick={() => onPage(page + 1)} aria-label="Next page">
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

function ProgramBadge({ program }: { program?: { code?: string | null; name?: string } }) {
  return <span className="badge">{program?.code ?? program?.name ?? "VEX"}</span>;
}

function GradeBadge({ grade }: { grade?: string | null }) {
  return <span className="badge">{gradeCode(grade)}</span>;
}

function TeamMiniLink({ team, className }: { team: { id: number; name: string }; className?: string }) {
  const programCode = useContext(ProgramContext);
  return (
    <Link href={teamSlugPath(programCode, team.name, team.id)} className={className}>
      {team.name}
    </Link>
  );
}

function AllianceTeamLinks({ teams, focusTeamId, dq }: { teams?: Match["alliances"][number]["teams"]; focusTeamId?: number; dq?: boolean }) {
  if (!teams?.length) return <>-</>;

  return (
    <span className="team-link-list">
      {teams.map((entry) => {
        const focusClass = focusTeamId ? (entry.team.id === focusTeamId ? "team-chip team-chip-focus" : "team-chip team-chip-muted") : undefined;
        return <TeamMiniLink key={entry.team.id} team={entry.team} className={focusClass} />;
      })}
      {dq && <span className="dq-badge">DQ</span>}
    </span>
  );
}

function FavoriteButton({ id, kind }: { id: number | string; kind: "team" | "event" }) {
  const key = `vex-alliance:favorites:${kind}`;
  const [active, setActive] = useState(() => {
    const saved = JSON.parse(localStorage.getItem(key) ?? "[]") as string[];
    return saved.includes(String(id));
  });

  return (
    <button
      className={`icon-button ${active ? "active" : ""}`}
      title={active ? "Remove favorite" : "Favorite"}
      onClick={() => {
        const saved = JSON.parse(localStorage.getItem(key) ?? "[]") as string[];
        const next = active ? saved.filter((item) => item !== String(id)) : [...new Set([...saved, String(id)])];
        localStorage.setItem(key, JSON.stringify(next));
        setActive(!active);
      }}
    >
      <Star size={17} fill={active ? "currentColor" : "none"} />
    </button>
  );
}

function Layout({ children, path }: { children: ReactNode; path: string }) {
  const nav = [
    ["/", "stemScout"],
    ["/events", "Events"],
    ["/teams", "Teams"],
    ["/insights", "Insights"],
  ];

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link href="/" className="brand">
            <span className="brand-mark">
              <Shield size={25} />
            </span>
            <span>stemScout</span>
          </Link>
          <nav>
            {nav.slice(1).map(([href, label]) => (
              <Link key={href} href={href} className={path === href ? "active" : ""}>
                {label}
              </Link>
            ))}
          </nav>
          <GlobalSearch className="topbar-search" />
        </div>
      </header>
      <main>{children}</main>
      <footer>
        <div>Event data from RobotEvents. Team stats and SuperScore from RoboStem DB.</div>
        <div className="footer-links">
          <Link href="/events">Events</Link>
          <Link href="/teams">Teams</Link>
          <Link href="/insights">Insights</Link>
          <Link href="/terms">Terms</Link>
        </div>
      </footer>
    </>
  );
}

const skillsLeaderboards = [
  {
    label: "VEX V5 High School Skills",
    url: "https://events.vex.com/robot-competitions/vex-robotics-competition/standings/skills?grade_level=High%20School",
    className: "v5 high",
  },
  {
    label: "VEX V5 Middle School Skills",
    url: "https://events.vex.com/robot-competitions/vex-robotics-competition/standings/skills?grade_level=Middle%20School",
    className: "v5 middle",
  },
  {
    label: "VEX IQ Middle School Skills",
    url: "https://events.vex.com/robot-competitions/vex-iq-competition/standings/skills?grade_level=Middle%20School",
    className: "iq middle",
  },
  {
    label: "VEX IQ Elementary School Skills",
    url: "https://events.vex.com/robot-competitions/vex-iq-competition/standings/skills?grade_level=Elementary",
    className: "iq elementary",
  },
  {
    label: "VEX U Skills",
    url: "https://events.vex.com/robot-competitions/college-competition/standings/skills",
    className: "vexu",
  },
];

const homeEventTabs: Array<{ label: string; value: HomeEventTab }> = [
  { label: "Popular", value: "popular" },
  { label: "Upcoming", value: "upcoming" },
  { label: "Today's Events", value: "today" },
  { label: "Signatures", value: "signatures" },
  { label: "Near Today", value: "near" },
];

function ProgramPicker({
  selectedProgramIds,
  onChange,
  triggerLabel = "Change program",
}: {
  selectedProgramIds: string[];
  onChange: (ids: string[]) => void;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [multi, setMulti] = useState(selectedProgramIds.length !== 1);
  const options = programOptions.filter((option) => option.value);

  const toggle = (id: string) => {
    if (!multi) {
      onChange([id]);
      setOpen(false);
    } else {
      onChange(selectedProgramIds.includes(id) ? selectedProgramIds.filter((value) => value !== id) : [...selectedProgramIds, id]);
    }
  };

  return (
    <span className="home-program-picker">
      <button type="button" className="change-program-btn" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        {triggerLabel}
      </button>
      {open && (
        <div className="picker-menu-list" style={{ zIndex: 20 }}>
          <div className="picker-multi-row">
            <label className="picker-multi-toggle">
              <input
                type="checkbox"
                checked={multi}
                onChange={(event) => {
                  setMulti(event.target.checked);
                  if (!event.target.checked && selectedProgramIds.length !== 1) {
                    onChange(selectedProgramIds.length ? selectedProgramIds.slice(0, 1) : [options[0].value]);
                  }
                }}
              />
              <span>Select multiple</span>
            </label>
            <button type="button" className="picker-menu-close" onClick={() => setOpen(false)} aria-label="Close">
              &times;
            </button>
          </div>
          {multi && (
            <div className="picker-menu-actions">
              <button type="button" onClick={() => onChange(options.map((option) => option.value))}>All</button>
              <button type="button" onClick={() => onChange([])}>Clear</button>
            </div>
          )}
          {options.map((option) =>
            multi ? (
              <label key={option.value}>
                <input type="checkbox" checked={selectedProgramIds.includes(option.value)} onChange={() => toggle(option.value)} />
                <span>{option.label}</span>
              </label>
            ) : (
              <button key={option.value} type="button" className={selectedProgramIds.includes(option.value) ? "active" : ""} onClick={() => toggle(option.value)}>
                <span>{option.label}</span>
              </button>
            ),
          )}
        </div>
      )}
    </span>
  );
}

function Home() {
  const [homeEventTab, setHomeEventTab] = useState<HomeEventTab>("upcoming");
  const [selectedProgramIds, setSelectedProgramIds] = useState<string[]>(() => programOptions.filter((option) => option.value).map((option) => option.value));
  const programKey = selectedProgramIds.join(",");
  const { data: events, loading: eventsLoading, error: eventsError } = useAsync(
    () =>
      api.events({
        start: dateOnly(addDays(today, -30)),
        end: dateOnly(addDays(today, 120)),
        per_page: 100,
        "program[]": selectedProgramIds.length ? selectedProgramIds : vexProgramIds,
      }),
    [programKey],
  );
  const baseHomeEvents = useMemo(
    () => filterAndSortEvents(events?.data ?? [], { hideCanceled: true, sort: "smart", programIds: selectedProgramIds }),
    [events, selectedProgramIds],
  );
  const homeEvents = useMemo(() => {
    if (homeEventTab === "popular") return [];
    if (homeEventTab === "today") {
      return baseHomeEvents
        .filter((event) => {
          const start = new Date(event.start ?? 0).getTime();
          const end = new Date(event.end ?? event.start ?? 0).getTime();
          const now = today.getTime();
          return start <= now && now <= end + oneDay;
        })
        .slice(0, 60);
    }
    if (homeEventTab === "signatures") {
      return baseHomeEvents.filter((event) => eventCategory(event).label === "Signature").sort((a, b) => compareEvents(a, b, "date")).slice(0, 60);
    }
    if (homeEventTab === "near") return baseHomeEvents.slice(0, 60);
    return baseHomeEvents
      .filter((event) => new Date(event.start ?? 0).getTime() >= today.getTime())
      .sort((a, b) => compareEvents(a, b, "date"))
      .slice(0, 60);
  }, [baseHomeEvents, homeEventTab]);

  return (
    <section className="page">
      <div className="home-dashboard">
        <aside className="home-sidebar">
          <Panel title="Skills Leaderboards" icon={<Trophy />}>
            <div className="skills-leaderboard-list">
              {skillsLeaderboards.map((lb) => (
                <a
                  key={lb.url}
                  href={lb.url}
                  target="_blank"
                  rel="noreferrer"
                  className={`skills-lb-btn ${lb.className}`}
                >
                  <span>{lb.label}</span>
                  <ExternalLink size={13} />
                </a>
              ))}
            </div>
          </Panel>

          <Panel title="Search" icon={<Search />}>
            <div className="home-search-panel">
              <GlobalSearch className="home-global-search" />
              <div className="home-actions">
                <Link href="/events" className="button-link secondary">
                  <CalendarDays size={15} />
                  Events
                </Link>
                <Link href="/teams" className="button-link secondary">
                  <Users size={15} />
                  Teams
                </Link>
              </div>
            </div>
          </Panel>
        </aside>

        <Panel
          title={
            <>
              VEX Robotics Competition Events
              <ProgramPicker selectedProgramIds={selectedProgramIds} onChange={setSelectedProgramIds} />
            </>
          }
          icon={<CalendarDays />}
          action={<Link href="/events">See all events</Link>}
        >
          <div className="home-event-tabs">
            {homeEventTabs.map((tab) => (
              <button
                key={tab.value}
                type="button"
                className={homeEventTab === tab.value ? "active" : ""}
                onClick={() => setHomeEventTab(tab.value)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <Status loading={eventsLoading} error={eventsError} />
          <EventTable events={homeEvents} loading={eventsLoading} compact showPriority showProgram />
        </Panel>
      </div>
    </section>
  );
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <div className="metric">
      <span>{icon}</span>
      <div>
        <strong>{value.toLocaleString()}</strong>
        <small>{label}</small>
      </div>
    </div>
  );
}

function Panel({ title, icon, children, action }: { title: ReactNode; icon: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="panel">
      <h2>
        <span className="panel-heading-title">
          {icon}
          {title}
        </span>
        {action && <span className="panel-heading-action">{action}</span>}
      </h2>
      {children}
    </section>
  );
}

const EVENT_FILTER_KEY = "vex-events-filters";

type SavedEventFilters = {
  level: string;
  selectedRegionKeys: string[];
  eventWindow: EventWindow;
  sort: EventSort;
  selectedSeasonIds: number[];
  seasonSelectionTouched: boolean;
  hideCanceled: boolean;
  filterLayout: EventFilterLayout;
  seasonMultiSelect: boolean;
  programMultiSelect: boolean;
  pastSeasonDateDir: "asc" | "desc";
  selectedGrades: string[];
};

function readEventFilters(): Partial<SavedEventFilters> {
  try {
    return JSON.parse(window.localStorage.getItem(EVENT_FILTER_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function EventsPage() {
  const params = new URLSearchParams(window.location.search);
  const [quickSearch, setQuickSearch] = useState(params.get("search") ?? "");
  const [quickSearchLimit, setQuickSearchLimit] = useState(3);
  const [activeQuickResult, setActiveQuickResult] = useState(0);
  const [selectedProgramIds, setSelectedProgramIds] = useState<string[]>(() => {
    const saved = window.localStorage.getItem("vex-events-programs");
    if (!saved) return ["1"];
    try {
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) && parsed.every((item) => typeof item === "string") ? parsed : ["1"];
    } catch {
      return ["1"];
    }
  });
  const [programMenuOpen, setProgramMenuOpen] = useState(false);
  const [level, setLevel] = useState<string>(() => readEventFilters().level ?? "");
  const [selectedRegionKeys, setSelectedRegionKeys] = useState<string[]>(() => readEventFilters().selectedRegionKeys ?? []);
  const [regionMenuOpen, setRegionMenuOpen] = useState(false);
  const [regionTab, setRegionTab] = useState<RegionOptionKind>("country");
  const [regionSearch, setRegionSearch] = useState("");
  const [eventWindow, setEventWindow] = useState<EventWindow>(() => readEventFilters().eventWindow ?? "near");
  const [sort, setSort] = useState<EventSort>(() => readEventFilters().sort ?? "smart");
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [filterLayout, setFilterLayout] = useState<EventFilterLayout>(() => readEventFilters().filterLayout ?? "sidebar");
  const [selectedSeasonIds, setSelectedSeasonIds] = useState<number[]>(() => readEventFilters().selectedSeasonIds ?? []);
  const [seasonSelectionTouched, setSeasonSelectionTouched] = useState<boolean>(() => readEventFilters().seasonSelectionTouched ?? false);
  const [seasonMenuOpen, setSeasonMenuOpen] = useState(false);
  const [seasonMultiSelect, setSeasonMultiSelect] = useState<boolean>(() => readEventFilters().seasonMultiSelect ?? false);
  const [programMultiSelect, setProgramMultiSelect] = useState<boolean>(() => readEventFilters().programMultiSelect ?? false);
  const [pastSeasonDateDir, setPastSeasonDateDir] = useState<"asc" | "desc">(() => readEventFilters().pastSeasonDateDir ?? "asc");
  const [selectedGrades, setSelectedGrades] = useState<string[]>(() => readEventFilters().selectedGrades ?? []);
  const [gradeMenuOpen, setGradeMenuOpen] = useState(false);
  const [lastOpenedMenu, setLastOpenedMenu] = useState<"region" | "season" | "program" | "sort" | "grade" | null>(null);
  const [hideCanceled, setHideCanceled] = useState<boolean>(() => readEventFilters().hideCanceled ?? true);
  const [page, setPage] = useState(1);
  const selectedProgramKey = selectedProgramIds.join(",");
  const selectedSeasonKey = selectedSeasonIds.join(",");
  const queryKey = `${eventWindow}:${selectedProgramKey}:${selectedSeasonKey}`;
  const dateWindow = eventWindowDates(eventWindow);
  const seasons = useAsync(() => collectAllPages<Season>((page) => api.robotEventsSeasons({ page, per_page: 250 })), []);
  const countries = useAsync(() => api.robotEventsCountries(), []);
  const countryRegions = useAsync(() => api.robotEventsRegions(), []);
  const { data, loading, error } = useAsync(
    () => {
      const q = {
        start: dateWindow.start,
        end: dateWindow.end,
        "program[]": selectedProgramIds.length ? selectedProgramIds : undefined,
        "season[]": selectedSeasonIds.length ? selectedSeasonIds : undefined,
        per_page: 250,
      };
      return eventWindow === "allSeason"
        ? collectAllPages((p) => api.events({ ...q, page: p }))
        : api.events(q);
    },
    [queryKey],
  );
  const seasonOptions = useMemo(() => {
    const selectedPrograms = new Set(selectedProgramIds.map(Number));
    return (seasons.data?.data ?? [])
      .filter((season) => !season.program || (vexProgramIds.includes(season.program.id) && (!selectedPrograms.size || selectedPrograms.has(season.program.id))))
      .map((season) => ({ id: season.id, label: shortSeasonName(season.name), program: season.program?.code ?? "" }))
      .sort((a, b) => b.id - a.id);
  }, [seasons.data, selectedProgramIds]);
  const allSeasonIds = useMemo(() => seasonOptions.map((season) => season.id), [seasonOptions]);
  const allSeasonsSelected = !!seasonOptions.length && sameNumberSet(selectedSeasonIds, allSeasonIds);
  const currentSeasonId = seasonOptions[0]?.id;
  const isPastSeasonView = !!currentSeasonId && selectedSeasonIds.length > 0 && !selectedSeasonIds.includes(currentSeasonId);
  const selectedProgramLabels = programOptions
    .filter((option) => option.value && selectedProgramIds.includes(option.value))
    .map((option) => option.label);
  const programButtonLabel =
    !selectedProgramIds.length || selectedProgramIds.length === programOptions.length - 1
      ? "All programs"
      : selectedProgramIds.length === 1
        ? selectedProgramLabels[0] ?? "Program"
        : `${selectedProgramIds.length} programs`;
  const gradeOptions = ["HS", "MS", "ES"] as const;
  const gradeButtonLabel =
    selectedGrades.length === 0 || selectedGrades.length === gradeOptions.length
      ? "All grades"
      : selectedGrades.length === 1
        ? selectedGrades[0]!
        : `${selectedGrades.length} grades`;
  const countryOptions = useMemo(() => dedupeCountryGroups(countries.data ?? []), [countries.data]);
  const sortOptions: Array<{ label: string; value: EventSort }> = [
    { label: "Smart Sort", value: "smart" },
    { label: "Start Date", value: "date" },
    { label: "Event Type", value: "type" },
    { label: "Program", value: "program" },
    { label: "Location", value: "location" },
    { label: "Name", value: "name" },
  ];
  const sortLabel = sortOptions.find((option) => option.value === sort)?.label ?? "Sort";
  const countryById = useMemo(() => new Map(countryOptions.map((country) => [country.value, country])), [countryOptions]);
  const regionOptions = useMemo<RegionOption[]>(() => {
    const countryItems = countryOptions.map((country) => ({
      key: optionKey("country", country.value),
      kind: "country" as const,
      label: country.label,
      badge: "Country",
      countryId: country.value,
      countryName: country.label,
    }));
    const subdivisionItems = (countryRegions.data ?? []).map((region) => {
      const country = countryById.get(region.country_id);
      return {
        key: optionKey("subdivision", region.id),
        kind: "subdivision" as const,
        label: country ? `${region.name}, ${country.label}` : region.name,
        badge: country?.country_id === "US" ? "State" : "State / Province",
        countryId: region.country_id,
        countryName: country?.label,
        regionName: region.name,
      };
    });
    const vexItems = new Map<string, RegionOption>();
    (data?.data ?? []).forEach((event) => {
      derivedVexRegionLabels(event).forEach((label) => {
        const key = optionKey("vex-region", label);
        if (!vexItems.has(key)) {
          vexItems.set(key, {
            key,
            kind: "vex-region",
            label,
            badge: "VEX Region",
            vexLabel: label,
          });
        }
      });
    });

    return [...countryItems, ...subdivisionItems, ...vexItems.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [countryOptions, countryRegions.data, countryById, data]);
  const selectedRegionOptions = useMemo(() => regionOptions.filter((option) => selectedRegionKeys.includes(option.key)), [regionOptions, selectedRegionKeys]);
  const regionButtonLabel =
    selectedRegionOptions.length === 0
      ? "All regions"
      : selectedRegionOptions.length === 1
        ? selectedRegionOptions[0].label
        : `${selectedRegionOptions.length} regions`;
  const visibleRegionOptions = regionOptions.filter((option) => {
    if (option.kind !== regionTab) return false;
    const needle = regionSearch.trim().toLowerCase();
    if (!needle) return true;
    return [option.label, option.badge, option.countryName, option.regionName, option.vexLabel].filter(Boolean).join(" ").toLowerCase().includes(needle);
  });
  const visibleEvents = useMemo(
    () =>
      filterAndSortEvents(data?.data ?? [], {
        programIds: selectedProgramIds,
        level,
        regionOptions: selectedRegionOptions,
        seasonIds: selectedSeasonIds,
        hideCanceled,
        grades: selectedGrades,
        sort: isPastSeasonView ? "past-season" : sort,
      }),
    [data, selectedProgramIds, level, selectedRegionOptions, selectedSeasonIds, hideCanceled, selectedGrades, sort, isPastSeasonView],
  );
  const quickResults = useMemo(() => {
    const needle = quickSearch.trim().toLowerCase();
    if (!needle) return [];
    return visibleEvents.filter((event) => event.name.toLowerCase().includes(needle)).slice(0, quickSearchLimit);
  }, [visibleEvents, quickSearch, quickSearchLimit]);
  const quickResultTotal = useMemo(() => {
    const needle = quickSearch.trim().toLowerCase();
    if (!needle) return 0;
    return visibleEvents.filter((event) => event.name.toLowerCase().includes(needle)).length;
  }, [visibleEvents, quickSearch]);
  const pageSize = 40;
  const totalPages = Math.max(1, Math.ceil(visibleEvents.length / pageSize));
  const pageEvents = visibleEvents.slice((page - 1) * pageSize, page * pageSize);
  const selectedSeasonLabels = seasonOptions.filter((season) => selectedSeasonIds.includes(season.id)).map((season) => season.label);
  const seasonButtonLabel =
    !selectedSeasonIds.length || selectedSeasonIds.length === seasonOptions.length
      ? "All seasons"
      : selectedSeasonIds.length === 1
        ? selectedSeasonLabels[0] ?? "Season"
        : `${selectedSeasonIds.length} seasons`;

  useEffect(() => {
    setPage(1);
  }, [selectedProgramIds, level, selectedRegionKeys, eventWindow, sort, selectedSeasonIds, hideCanceled, selectedGrades]);

  useEffect(() => {
    setQuickSearchLimit(3);
    setActiveQuickResult(0);
  }, [quickSearch, visibleEvents]);

  useEffect(() => {
    window.localStorage.setItem("vex-events-programs", JSON.stringify(selectedProgramIds));
    window.localStorage.setItem(EVENT_FILTER_KEY, JSON.stringify({
      level, selectedRegionKeys, eventWindow, sort, selectedSeasonIds,
      seasonSelectionTouched, hideCanceled, filterLayout, seasonMultiSelect, programMultiSelect, pastSeasonDateDir, selectedGrades,
    } satisfies SavedEventFilters));
  }, [level, selectedRegionKeys, eventWindow, sort, selectedSeasonIds, seasonSelectionTouched, hideCanceled, filterLayout, seasonMultiSelect, programMultiSelect, pastSeasonDateDir, selectedGrades, selectedProgramIds]);

  useEffect(() => {
    if (!seasonOptions.length) return;
    const availableIds = new Set(seasonOptions.map((season) => season.id));
    if (!seasonSelectionTouched) {
      setSelectedSeasonIds([seasonOptions[0].id]);
      return;
    }
    setSelectedSeasonIds((ids) => {
      if (!ids.length) return ids;
      return ids.filter((id) => availableIds.has(id));
    });
  }, [seasonOptions, seasonSelectionTouched]);

  useEffect(() => {
    if (selectedRegionKeys.length && regionOptions.length) {
      const availableKeys = new Set(regionOptions.map((option) => option.key));
      setSelectedRegionKeys((keys) => {
        const nextKeys = keys.filter((key) => availableKeys.has(key));
        return nextKeys.length === keys.length ? keys : nextKeys;
      });
    }
  }, [selectedRegionKeys, regionOptions]);

  const toggleSeason = (seasonId: number) => {
    setSeasonSelectionTouched(true);
    if (!seasonMultiSelect) {
      setSelectedSeasonIds([seasonId]);
      setSeasonMenuOpen(false);
      if (currentSeasonId && seasonId !== currentSeasonId) {
        setEventWindow("allSeason");
      } else {
        setEventWindow("near");
      }
    } else {
      setSelectedSeasonIds((ids) => (ids.includes(seasonId) ? ids.filter((id) => id !== seasonId) : [...ids, seasonId]));
    }
  };
  const toggleProgram = (programId: string) => {
    if (!programMultiSelect) {
      setSelectedProgramIds([programId]);
      setProgramMenuOpen(false);
    } else {
      setSelectedProgramIds((ids) => (ids.includes(programId) ? ids.filter((id) => id !== programId) : [...ids, programId]));
    }
    setSeasonSelectionTouched(false);
    setSelectedSeasonIds([]);
  };
  const selectAllPrograms = () => {
    setSelectedProgramIds(programOptions.map((option) => option.value).filter(Boolean));
    setSeasonSelectionTouched(false);
    setSelectedSeasonIds([]);
  };
  const clearPrograms = () => {
    setSelectedProgramIds([]);
    setSeasonSelectionTouched(false);
    setSelectedSeasonIds([]);
  };
  const selectAllSeasons = () => {
    setSeasonSelectionTouched(true);
    setSelectedSeasonIds(seasonOptions.map((season) => season.id));
  };
  const clearSeasons = () => {
    setSeasonSelectionTouched(true);
    setSelectedSeasonIds([]);
  };
  const resetFilters = () => {
    window.localStorage.removeItem(EVENT_FILTER_KEY);
    window.localStorage.removeItem("vex-events-programs");
    setSelectedProgramIds(["1"]);
    setLevel("");
    setSelectedRegionKeys([]);
    setEventWindow("near");
    setSort("smart");
    setSelectedSeasonIds([]);
    setSeasonSelectionTouched(false);
    setHideCanceled(true);
    setFilterLayout("sidebar");
    setSeasonMultiSelect(false);
    setProgramMultiSelect(false);
    setPastSeasonDateDir("asc");
    setSelectedGrades([]);
  };
  const setQuickFilter = (nextLevel: string, nextWindow: EventWindow, nextSort: EventSort = "smart") => {
    setLevel(nextLevel);
    setEventWindow(nextWindow);
    setSort(nextSort);
  };
  const toggleRegion = (key: string) => {
    setSelectedRegionKeys((keys) => (keys.includes(key) ? keys.filter((item) => item !== key) : [...keys, key]));
  };
  const clearRegions = () => {
    setSelectedRegionKeys([]);
  };
  const openQuickResult = (event?: Event) => {
    if (event) navigate(eventPath(event));
  };
  const handleQuickSearchKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!quickResults.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveQuickResult((index) => Math.min(index + 1, quickResults.length - 1));
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveQuickResult((index) => Math.max(index - 1, 0));
    }
    if (event.key === "Enter") {
      event.preventDefault();
      openQuickResult(quickResults[activeQuickResult] ?? quickResults[0]);
    }
  };

  const filterControls = (
    <>
      <div className="filter-section">
        <div className="filter-section-title">Time</div>
        <div className="quick-filters">
          <button className={eventWindow === "near" ? "active" : ""} onClick={() => setEventWindow("near")}>
            Near today
          </button>
          <button className={eventWindow === "upcoming" ? "active" : ""} onClick={() => setEventWindow("upcoming")}>
            Upcoming
          </button>
          <button className={eventWindow === "allSeason" ? "active" : ""} onClick={() => setEventWindow("allSeason")}>
            All
          </button>
        </div>
      </div>
      <div className="filter-section">
        <div className="filter-section-title">Type</div>
        <div className="quick-filters">
          <button className={!level ? "active" : ""} onClick={() => setLevel("")}>
            All
          </button>
          <button className={level === "World" ? "active" : ""} onClick={() => setQuickFilter("World", eventWindow)}>
            Worlds
          </button>
          <button className={level === "Signature" ? "active" : ""} onClick={() => setQuickFilter("Signature", eventWindow)}>
            Signature
          </button>
          <button className={level === "Championship" ? "active" : ""} onClick={() => setQuickFilter("Championship", eventWindow)}>
            Championships
          </button>
          <button className={level === "Other" ? "active" : ""} onClick={() => setLevel("Other")}>
            Other
          </button>
        </div>
      </div>
      <div className="event-filter-fields">
        <div className="filter-field">
          <span>
            Seasons
            {isPastSeasonView && currentSeasonId && (
              <button
                type="button"
                className="back-to-season-btn"
                onClick={() => {
                  setSeasonSelectionTouched(true);
                  setSelectedSeasonIds([currentSeasonId]);
                  setEventWindow("near");
                }}
              >
                Back to {seasonOptions[0]?.label}
              </button>
            )}
          </span>
          <div className="picker-menu season-picker-menu">
            <button type="button" onClick={() => { setSeasonMenuOpen((open) => !open); setLastOpenedMenu("season"); }} aria-expanded={seasonMenuOpen}>
              {seasonButtonLabel}
            </button>
            {seasonMenuOpen && (
              <div className="picker-menu-list" style={{ zIndex: lastOpenedMenu === "season" ? 20 : 10 }}>
                <label className="picker-multi-toggle">
                  <input
                    type="checkbox"
                    checked={seasonMultiSelect}
                    onChange={(e) => {
                      setSeasonMultiSelect(e.target.checked);
                      if (!e.target.checked && selectedSeasonIds.length > 1) {
                        setSelectedSeasonIds(selectedSeasonIds.slice(0, 1));
                      }
                    }}
                  />
                  <span>Select multiple</span>
                </label>
                {seasonMultiSelect && (
                  <div className="picker-menu-actions">
                    <button type="button" onClick={selectAllSeasons}>All</button>
                    <button type="button" onClick={clearSeasons}>Clear</button>
                  </div>
                )}
                {seasonOptions.map((season) =>
                  seasonMultiSelect ? (
                    <label key={season.id}>
                      <input type="checkbox" checked={selectedSeasonIds.includes(season.id)} onChange={() => toggleSeason(season.id)} />
                      <span>{season.label}</span>
                      {season.program && <small>{season.program}</small>}
                    </label>
                  ) : (
                    <button key={season.id} type="button" className={selectedSeasonIds.includes(season.id) ? "active" : ""} onClick={() => toggleSeason(season.id)}>
                      <span>{season.label}</span>
                      {season.program && <small>{season.program}</small>}
                    </button>
                  )
                )}
                {!seasonOptions.length && <div className="picker-menu-empty">Loading seasons...</div>}
              </div>
            )}
          </div>
        </div>
        <div className="filter-field-pair">
          <div className="filter-field">
            <span>Programs</span>
            <div className="picker-menu">
              <button type="button" onClick={() => { setProgramMenuOpen((open) => !open); setLastOpenedMenu("program"); }} aria-expanded={programMenuOpen}>
                {programButtonLabel}
              </button>
              {programMenuOpen && (
                <div className="picker-menu-list" style={{ zIndex: lastOpenedMenu === "program" ? 20 : 10 }}>
                  <label className="picker-multi-toggle">
                    <input
                      type="checkbox"
                      checked={programMultiSelect}
                      onChange={(e) => {
                        setProgramMultiSelect(e.target.checked);
                        if (!e.target.checked && selectedProgramIds.length > 1) {
                          setSelectedProgramIds(selectedProgramIds.slice(0, 1));
                          setSeasonSelectionTouched(false);
                          setSelectedSeasonIds([]);
                        }
                      }}
                    />
                    <span>Select multiple</span>
                  </label>
                  {programMultiSelect && (
                    <div className="picker-menu-actions">
                      <button type="button" onClick={selectAllPrograms}>All</button>
                      <button type="button" onClick={clearPrograms}>Clear</button>
                    </div>
                  )}
                  {programOptions
                    .filter((option) => option.value)
                    .map((option) =>
                      programMultiSelect ? (
                        <label key={option.value}>
                          <input type="checkbox" checked={selectedProgramIds.includes(option.value)} onChange={() => toggleProgram(option.value)} />
                          <span>{option.label}</span>
                        </label>
                      ) : (
                        <button key={option.value} type="button" className={selectedProgramIds.includes(option.value) ? "active" : ""} onClick={() => toggleProgram(option.value)}>
                          <span>{option.label}</span>
                        </button>
                      )
                    )}
                </div>
              )}
            </div>
          </div>
          <div className="filter-field">
            <span>Grade</span>
            <div className="picker-menu">
              <button type="button" onClick={() => { setGradeMenuOpen((open) => !open); setLastOpenedMenu("grade"); }} aria-expanded={gradeMenuOpen}>
                {gradeButtonLabel}
              </button>
              {gradeMenuOpen && (
                <div className="picker-menu-list" style={{ zIndex: lastOpenedMenu === "grade" ? 20 : 10 }}>
                  <div className="picker-menu-actions">
                    <button type="button" onClick={() => setSelectedGrades([])}>All</button>
                    <button type="button" onClick={() => setSelectedGrades([])}>Clear</button>
                  </div>
                  {gradeOptions.map((g) => (
                    <label key={g}>
                      <input
                        type="checkbox"
                        checked={selectedGrades.length === 0 || selectedGrades.includes(g)}
                        onChange={() =>
                          setSelectedGrades((prev) => {
                            // If currently "all" (empty = all), clicking one grade means exclude others
                            const effective = prev.length === 0 ? [...gradeOptions] : prev;
                            const next = effective.includes(g) ? effective.filter((x) => x !== g) : [...effective, g];
                            return next.length === gradeOptions.length ? [] : next;
                          })
                        }
                      />
                      <span>{g === "HS" ? "High School" : g === "MS" ? "Middle School" : "Elementary"}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="filter-field">
          <span>Region</span>
          <div className="picker-menu">
            <button type="button" onClick={() => { setRegionMenuOpen((open) => !open); setLastOpenedMenu("region"); }} aria-expanded={regionMenuOpen}>
              {regionButtonLabel}
            </button>
            {regionMenuOpen && (
              <div className="picker-menu-list region-menu-list" style={{ zIndex: lastOpenedMenu === "region" ? 20 : 10 }}>
                <div className="picker-tabs">
                  <button type="button" className={regionTab === "country" ? "active" : ""} onClick={() => setRegionTab("country")}>
                    Countries
                  </button>
                  <button type="button" className={regionTab === "subdivision" ? "active" : ""} onClick={() => setRegionTab("subdivision")}>
                    State / Province
                  </button>
                  <button type="button" className={regionTab === "vex-region" ? "active" : ""} onClick={() => setRegionTab("vex-region")}>
                    Region
                  </button>
                </div>
                <input className="picker-search" value={regionSearch} onChange={(event) => setRegionSearch(event.target.value)} placeholder="Search regions" />
                <div className="picker-menu-actions">
                  <button type="button" onClick={clearRegions}>
                    Clear
                  </button>
                </div>
                <div className="region-option-list">
                  {visibleRegionOptions.map((option) => (
                    <label key={option.key}>
                      <input type="checkbox" checked={selectedRegionKeys.includes(option.key)} onChange={() => toggleRegion(option.key)} />
                      <span>{option.label}</span>
                      <small>{option.badge}</small>
                    </label>
                  ))}
                </div>
                {!visibleRegionOptions.length && <div className="picker-menu-empty">No matches.</div>}
              </div>
            )}
          </div>
        </div>
        <div className="filter-field">
          <span>Sort</span>
          <div className="picker-menu">
            <button type="button" onClick={() => { setSortMenuOpen((open) => !open); setLastOpenedMenu("sort"); }} aria-expanded={sortMenuOpen}>
              {sortLabel}
            </button>
            {sortMenuOpen && (
              <div className="picker-menu-list" style={{ zIndex: lastOpenedMenu === "sort" ? 20 : 10 }}>
                {sortOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={sort === option.value ? "active" : ""}
                    onClick={() => {
                      setSort(option.value);
                      setSortMenuOpen(false);
                    }}
                  >
                    <span>{option.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <label className="checkbox-filter">
          <input type="checkbox" checked={hideCanceled} onChange={(event) => setHideCanceled(event.target.checked)} />
          Hide canceled
        </label>
      </div>
    </>
  );

  return (
    <section className="page">
      <div className="events-title-row">
        <PageTitle icon={<CalendarDays />} title="Events" />
        <button
          className="icon-button"
          onClick={() => setFilterLayout((layout) => (layout === "sidebar" ? "inline" : "sidebar"))}
          aria-label={filterLayout === "sidebar" ? "Use compact filters" : "Use sidebar filters"}
          title={filterLayout === "sidebar" ? "Compact filters" : "Sidebar filters"}
        >
          {filterLayout === "sidebar" ? <ListFilter size={16} /> : <PanelRight size={16} />}
        </button>
      </div>
      {filterLayout === "inline" && <div className="event-toolbar event-toolbar-inline">{filterControls}</div>}
      <div className={filterLayout === "sidebar" ? "events-layout" : ""}>
        <Panel title="Event List" icon={<CalendarDays />}>
          <Status loading={loading} error={error} />
          <div className="event-quick-search">
            <label className="search-field">
              <Search size={16} />
              <input
                value={quickSearch}
                onChange={(event) => setQuickSearch(event.target.value)}
                onKeyDown={handleQuickSearchKey}
                placeholder="Quick search event name"
              />
            </label>
            {!!quickSearch.trim() && (
              <div className="quick-search-results">
                {quickResults.map((event, index) => (
                  <button
                    key={event.id}
                    className={index === activeQuickResult ? "active" : ""}
                    type="button"
                    onMouseEnter={() => setActiveQuickResult(index)}
                    onClick={() => openQuickResult(event)}
                  >
                    <span>{event.name}</span>
                    <small>{formatEventDateRange(event.start, event.end)}</small>
                  </button>
                ))}
                {!quickResults.length && <div className="quick-search-empty">No matching event names.</div>}
                {quickSearchLimit < quickResultTotal && (
                  <button type="button" className="show-more-results" onClick={() => setQuickSearchLimit((limit) => limit + 3)}>
                    Show more
                  </button>
                )}
              </div>
            )}
          </div>
          {isPastSeasonView ? (
            <PastSeasonEventView
              events={visibleEvents}
              loading={loading}
              showSeason={!selectedSeasonIds.length || allSeasonsSelected}
              showGrade
              dateDir={pastSeasonDateDir}
              onDateDirToggle={() => setPastSeasonDateDir((d) => (d === "asc" ? "desc" : "asc"))}
            />
          ) : (
            <>
              <EventTable events={pageEvents} loading={loading} showPriority showGrade showSeason={!selectedSeasonIds.length || allSeasonsSelected} />
              {!loading && (
                <div className="pager">
                  <button disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page">
                    <ChevronLeft size={16} />
                  </button>
                  <span>
                    Page {page.toLocaleString()} of {totalPages.toLocaleString()}
                  </span>
                  <button disabled={page >= totalPages} onClick={() => setPage(page + 1)} aria-label="Next page">
                    <ChevronRight size={16} />
                  </button>
                </div>
              )}
            </>
          )}
        </Panel>
        {filterLayout === "sidebar" && (
          <aside className="event-filter-sidebar">
            <div className="event-filter-sidebar-title">
              Filters
              <button type="button" className="reset-filters-btn" onClick={resetFilters}>Reset to defaults</button>
            </div>
            {filterControls}
          </aside>
        )}
      </div>
    </section>
  );
}

const TIER_COLLAPSE_THRESHOLD = 3;

function TierSection({
  label,
  events,
  collapsible,
  showSeason,
  showGrade,
  loading,
  dateSortDir,
  onDateSortToggle,
  paginate = false,
}: {
  label: string;
  events: Event[];
  collapsible: boolean;
  showSeason?: boolean;
  showGrade?: boolean;
  loading: boolean;
  dateSortDir?: "asc" | "desc";
  onDateSortToggle?: () => void;
  paginate?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 40;

  // Reset page when event list changes length (filter/sort change)
  const eventsLength = events.length;
  useEffect(() => { setPage(1); }, [eventsLength]);

  const totalPages = paginate ? Math.max(1, Math.ceil(events.length / pageSize)) : 1;
  const showFade = !paginate && collapsible && events.length > TIER_COLLAPSE_THRESHOLD && !expanded;
  const displayEvents = paginate
    ? events.slice((page - 1) * pageSize, page * pageSize)
    : showFade ? events.slice(0, TIER_COLLAPSE_THRESHOLD) : events;

  return (
    <div className="tier-section">
      <h3 className="tier-section-title">
        {label} <span className="tier-count">({events.length})</span>
      </h3>
      <div className={`tier-collapse${showFade ? " is-collapsed" : ""}`}>
        <EventTable events={displayEvents} loading={loading} showSeason={showSeason} showGrade={showGrade} dateSortDir={dateSortDir} onDateSortToggle={onDateSortToggle} />
        {showFade && (
          <button className="alliance-show-all" onClick={() => setExpanded(true)}>
            Show all {events.length} <ChevronDown size={15} />
          </button>
        )}
        {collapsible && expanded && (
          <button className="alliance-show-all alliance-show-less" onClick={() => setExpanded(false)}>
            <ChevronUp size={18} />
          </button>
        )}
      </div>
      {paginate && totalPages > 1 && (
        <div className="pager">
          <span className="tier-pagination-note">Other Events only — top tiers use expand/collapse</span>
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page">
            <ChevronLeft size={16} />
          </button>
          <span>Page {page} of {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(page + 1)} aria-label="Next page">
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

function PastSeasonEventView({
  events,
  loading,
  showSeason,
  showGrade,
  dateDir,
  onDateDirToggle,
}: {
  events: Event[];
  loading: boolean;
  showSeason?: boolean;
  showGrade?: boolean;
  dateDir: "asc" | "desc";
  onDateDirToggle: () => void;
}) {
  const tiers: Array<{ label: string; category: EventCategory; collapsible: boolean; paginate: boolean }> = [
    { label: "World Championships", category: "Worlds", collapsible: true, paginate: false },
    { label: "Signature Events", category: "Signature", collapsible: true, paginate: false },
    { label: "Championships", category: "Championship", collapsible: true, paginate: false },
    { label: "Other Events", category: "Other", collapsible: false, paginate: true },
  ];

  return (
    <div className="past-season-view">
      {tiers.map((tier) => {
        const tierEvents = events
          .filter((e) => eventCategory(e).label === tier.category)
          .sort((a, b) => {
            const tA = new Date(a.start ?? 0).getTime();
            const tB = new Date(b.start ?? 0).getTime();
            return (dateDir === "desc" ? tB - tA : tA - tB) || a.name.localeCompare(b.name);
          });
        if (!loading && !tierEvents.length) return null;
        return (
          <TierSection
            key={tier.category}
            label={tier.label}
            events={tierEvents}
            collapsible={tier.collapsible}
            paginate={tier.paginate}
            showSeason={showSeason}
            showGrade={showGrade}
            loading={loading && !tierEvents.length}
            dateSortDir={dateDir}
            onDateSortToggle={onDateDirToggle}
          />
        );
      })}
    </div>
  );
}

function EventTable({
  events,
  loading,
  compact = false,
  showPriority = false,
  showSeason = false,
  showGrade = false,
  showProgram: showProgramProp,
  dateSortDir,
  onDateSortToggle,
}: {
  events: Event[];
  loading: boolean;
  compact?: boolean;
  showPriority?: boolean;
  showSeason?: boolean;
  showGrade?: boolean;
  showProgram?: boolean;
  dateSortDir?: "asc" | "desc";
  onDateSortToggle?: () => void;
}) {
  const showProgram = showProgramProp ?? !compact;
  const showLevel = !compact && !showPriority;
  const columnCount = 3 + (showPriority ? 1 : 0) + (showProgram ? 1 : 0) + (showSeason ? 1 : 0) + (showLevel ? 1 : 0) + (showGrade ? 1 : 0);

  return (
    <table>
      <thead>
        <tr>
          <th>Event</th>
          {showPriority && <th>Priority</th>}
          {showProgram && <th>Program</th>}
          {showGrade && <th className="grade-col">Grade</th>}
          {showSeason && <th>Season</th>}
          <th>Location</th>
          <th>
            {onDateSortToggle ? (
              <button type="button" className="sort-col-btn" onClick={onDateSortToggle}>
                Dates {dateSortDir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
            ) : (
              "Dates"
            )}
          </th>
          {showLevel && <th>Level</th>}
        </tr>
      </thead>
      {loading ? (
        <LoadingTable columns={columnCount} />
      ) : (
        <tbody>
          {events.map((event) => (
            <tr key={event.id}>
              <td>
                <Link href={eventPath(event)}>{event.name}</Link>
                <div className="muted">{event.sku}</div>
              </td>
              {showPriority && (
                <td>
                  <span className={`event-priority priority-${eventCategory(event).rank}`}>{eventCategory(event).label}</span>
                </td>
              )}
              {showProgram && (
                <td>
                  <ProgramBadge program={event.program} />
                </td>
              )}
              {showGrade && (
                <td className="grade-col">
                  <span className={`event-grade-badge grade-${eventGradeCode(event)}`}>{eventGradeCode(event)}</span>
                </td>
              )}
              {showSeason && <td>{shortSeasonName(event.season.name)}</td>}
              <td>{locationLine(event)}</td>
              <td>
                <span className="date-range">{formatEventDateRange(event.start, event.end)}</span>
              </td>
              {showLevel && (
                <td>
                  <span className={`event-priority priority-${eventCategory(event).rank}`}>{eventCategory(event).label}</span>
                </td>
              )}
            </tr>
          ))}
          {!events.length && (
            <tr>
              <td colSpan={columnCount}>
                <Empty />
              </td>
            </tr>
          )}
        </tbody>
      )}
    </table>
  );
}

function TeamsPage() {
  const params = new URLSearchParams(window.location.search);
  const [search, setSearch] = useState(params.get("search") ?? "");
  const [submittedSearch, setSubmittedSearch] = useState(params.get("search") ?? "");
  const debouncedQuickSearch = useDebouncedValue(search.trim(), 220);
  const [program, setProgram] = useState("1");
  const [selectedRegionKeys, setSelectedRegionKeys] = useState<string[]>([]);
  const [regionMenuOpen, setRegionMenuOpen] = useState(false);
  const [regionTab, setRegionTab] = useState<RegionOptionKind>("country");
  const [regionSearch, setRegionSearch] = useState("");
  const [registered, setRegistered] = useState("true");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paginated<Team> | null>(null);
  const [quickData, setQuickData] = useState<Team[]>([]);
  const [quickLoading, setQuickLoading] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const reloadTeamsRef = useRef<() => void>(() => {});
  const cacheKey = cachedTeamsKey(program, registered);
  const committedSearch = submittedSearch.trim();
  const isSearchingTeams = !!committedSearch;
  const countries = useAsync(() => api.robotEventsCountries(), []);
  const countryRegions = useAsync(() => api.robotEventsRegions(), []);
  const baseQuery = useMemo(
    () => ({
      "program[]": program ? [program] : undefined,
      registered: registered === "" ? undefined : registered,
    }),
    [program, registered],
  );

  useEffect(() => {
    let live = true;

    const loadTeams = async ({ background = false, force = false } = {}) => {
      setError(null);
      if (!background) setLoading(true);
      if (background) setRefreshing(true);

      try {
        const result = isSearchingTeams
          ? await collectAllPages<Team>((page) =>
              api.teams({
                ...baseQuery,
                teamSearch: committedSearch,
                page,
                per_page: 250,
              }),
            )
          : await loadCachedTeams(
              cacheKey,
              {
                ...baseQuery,
                per_page: 250,
              },
              force,
            );

        if (live) {
          setData(isSearchingTeams ? { ...result, data: rankTeamsForSearch(result.data, committedSearch) } : result);
          if (!isSearchingTeams) setLastUpdated(teamListCache.get(cacheKey)?.updatedAt ?? Date.now());
        }
      } catch (err) {
        if (live) setError((err as Error).message);
      } finally {
        if (live) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    };

    reloadTeamsRef.current = () => {
      void loadTeams({ background: true, force: true });
    };

    if (isSearchingTeams) {
      loadTeams();
      return () => {
        live = false;
      };
    }

    (async () => {
      let cached = teamListCache.get(cacheKey);
      // Hydrate the in-memory cache from IndexedDB so a reload shows data instantly.
      if (!cached?.data) {
        const stored = await idbGetTeams(cacheKey);
        if (stored?.data) {
          teamListCache.set(cacheKey, stored);
          cached = stored;
        }
      }

      if (cached?.data && live) {
        setData(cached.data);
        setLastUpdated(cached.updatedAt || null);
        setLoading(false);
      }

      const cacheAge = cached?.updatedAt ? Date.now() - cached.updatedAt : Number.POSITIVE_INFINITY;
      if (!cached?.data || cacheAge >= teamCacheRefreshMs) {
        void loadTeams({ background: !!cached?.data });
      }
    })();

    const interval = window.setInterval(() => void loadTeams({ background: true }), teamCacheRefreshMs);

    return () => {
      live = false;
      window.clearInterval(interval);
    };
  }, [baseQuery, cacheKey, committedSearch, isSearchingTeams, page]);

  const cachedTeams = teamListCache.get(cacheKey)?.data?.data;
  const quickSourceTeams = cachedTeams ?? (!isSearchingTeams ? data?.data : []) ?? [];
  const countryOptions = useMemo(() => dedupeCountryGroups(countries.data ?? []), [countries.data]);
  const countryById = useMemo(() => new Map(countryOptions.map((country) => [country.value, country])), [countryOptions]);
  const regionOptions = useMemo<RegionOption[]>(() => {
    const countryItems = countryOptions.map((country) => ({
      key: optionKey("country", country.value),
      kind: "country" as const,
      label: country.label,
      badge: "Country",
      countryId: country.value,
      countryName: country.label,
    }));
    const subdivisionItems = (countryRegions.data ?? []).map((region) => {
      const country = countryById.get(region.country_id);
      return {
        key: optionKey("subdivision", region.id),
        kind: "subdivision" as const,
        label: country ? `${region.name}, ${country.label}` : region.name,
        badge: country?.country_id === "US" ? "State" : "State / Province",
        countryId: region.country_id,
        countryName: country?.label,
        regionName: region.name,
      };
    });
    const teamRegionItems = new Map<string, RegionOption>();
    (data?.data ?? cachedTeams ?? []).forEach((team) => {
      const label = team.location?.region?.trim();
      if (!label) return;
      const key = optionKey("vex-region", label);
      if (!teamRegionItems.has(key)) {
        teamRegionItems.set(key, {
          key,
          kind: "vex-region",
          label,
          badge: "Region",
          vexLabel: label,
        });
      }
    });

    return [...countryItems, ...subdivisionItems, ...teamRegionItems.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [cachedTeams, countryOptions, countryRegions.data, countryById, data]);
  const selectedRegionOptions = regionOptions.filter((option) => selectedRegionKeys.includes(option.key));
  const regionButtonLabel =
    selectedRegionOptions.length === 0
      ? "All regions"
      : selectedRegionOptions.length === 1
        ? selectedRegionOptions[0].label
        : `${selectedRegionOptions.length} regions`;
  const visibleRegionOptions = regionOptions.filter((option) => {
    if (option.kind !== regionTab) return false;
    const needle = regionSearch.trim().toLowerCase();
    if (!needle) return true;
    return [option.label, option.badge, option.countryName, option.regionName, option.vexLabel].filter(Boolean).join(" ").toLowerCase().includes(needle);
  });
  const toggleRegion = (key: string) => {
    setSelectedRegionKeys((keys) => (keys.includes(key) ? keys.filter((item) => item !== key) : [...keys, key]));
    setPage(1);
  };
  const clearRegions = () => {
    setSelectedRegionKeys([]);
    setPage(1);
  };

  const localQuickResults = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return [];
    return rankTeamsForSearch(
      quickSourceTeams.filter((team) => {
        if (!teamMatchesRegionOptions(team, selectedRegionOptions)) return false;
        const haystack = [team.number, team.team_name, team.organization, team.grade, team.registered ? "registered" : "inactive", locationLine(team)]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(needle);
      }),
      search,
    );
  }, [quickSourceTeams, search, selectedRegionOptions]);

  const quickResults = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return [];
    return rankTeamsForSearch(
      uniqueTeams([...localQuickResults, ...quickData]).filter((team) => {
        if (!teamMatchesRegionOptions(team, selectedRegionOptions)) return false;
        const haystack = [team.number, team.team_name, team.organization, team.grade, team.registered ? "registered" : "inactive", locationLine(team)]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(needle);
      }),
      search,
    );
  }, [localQuickResults, quickData, search, selectedRegionOptions]);

  const sortedTeams = useMemo(() => [...(data?.data ?? [])].sort(isSearchingTeams ? compareTeamsForSearch(committedSearch) : compareTeamsNatural), [committedSearch, data, isSearchingTeams]);

  const tableTeams = useMemo(
    () => (isSearchingTeams ? sortedTeams : data?.data ?? []).filter((team) => teamMatchesRegionOptions(team, selectedRegionOptions)),
    [data, isSearchingTeams, selectedRegionOptions, sortedTeams],
  );

  useEffect(() => {
    setPage(1);
  }, [submittedSearch, program, selectedRegionKeys, registered]);

  useEffect(() => {
    if (selectedRegionKeys.length && regionOptions.length) {
      const availableKeys = new Set(regionOptions.map((option) => option.key));
      setSelectedRegionKeys((keys) => keys.filter((key) => availableKeys.has(key)));
    }
  }, [selectedRegionKeys, regionOptions]);

  useEffect(() => {
    if (!search.trim()) setQuickData([]);
  }, [search]);

  useEffect(() => {
    let live = true;
    const needle = debouncedQuickSearch.trim();
    if (!needle) {
      setQuickData([]);
      setQuickLoading(false);
      return () => {
        live = false;
      };
    }

    setQuickLoading(true);
    api
      .teams({
        ...baseQuery,
        teamSearch: needle,
        page: 1,
        per_page: 50,
      })
      .then((result) => {
        if (live) setQuickData(rankTeamsForSearch(result.data, needle));
      })
      .catch(() => {
        if (live) setQuickData([]);
      })
      .finally(() => {
        if (live) setQuickLoading(false);
      });

    return () => {
      live = false;
    };
  }, [baseQuery, debouncedQuickSearch]);

  const submitSearch = () => {
    const nextSearch = search.trim();
    setSubmittedSearch(nextSearch);
    setPage(1);
    setQuickOpen(false);
    const nextParams = new URLSearchParams(window.location.search);
    if (nextSearch) nextParams.set("search", nextSearch);
    else nextParams.delete("search");
    const nextUrl = `${window.location.pathname}${nextParams.toString() ? `?${nextParams.toString()}` : ""}`;
    window.history.replaceState(null, "", nextUrl);
  };

  return (
    <section className="page">
      <PageTitle icon={<Users />} title="Teams" subtitle="Search team numbers, names, regions, programs, grade levels, and registration status." />
      <SearchFilters
        search={search}
        setSearch={(value) => {
          setSearch(value);
          setQuickOpen(!!value.trim());
        }}
        onSubmit={submitSearch}
        onFocus={() => setQuickOpen(!!search.trim())}
        program={program}
        setProgram={(value) => {
          setProgram(value);
          setPage(1);
        }}
        placeholder="Search team number, name, or region"
        quickResults={quickResults}
        quickLoading={quickLoading}
        quickOpen={quickOpen}
        onPickTeam={(team) => {
          navigate(teamPath(team));
        }}
        regionControl={
          <div className="team-region-filter picker-menu">
            <button type="button" onClick={() => setRegionMenuOpen((open) => !open)} aria-expanded={regionMenuOpen}>
              {regionButtonLabel}
            </button>
            {regionMenuOpen && (
              <div className="picker-menu-list region-menu-list team-region-menu-list">
                <div className="picker-tabs">
                  <button type="button" className={regionTab === "country" ? "active" : ""} onClick={() => setRegionTab("country")}>
                    Countries
                  </button>
                  <button type="button" className={regionTab === "subdivision" ? "active" : ""} onClick={() => setRegionTab("subdivision")}>
                    State / Province
                  </button>
                  <button type="button" className={regionTab === "vex-region" ? "active" : ""} onClick={() => setRegionTab("vex-region")}>
                    Region
                  </button>
                </div>
                <input className="picker-search" value={regionSearch} onChange={(event) => setRegionSearch(event.target.value)} placeholder="Search regions" />
                <div className="picker-menu-actions">
                  <button type="button" onClick={clearRegions}>
                    Clear
                  </button>
                </div>
                <div className="region-option-list">
                  {visibleRegionOptions.map((option) => (
                    <label key={option.key}>
                      <input type="checkbox" checked={selectedRegionKeys.includes(option.key)} onChange={() => toggleRegion(option.key)} />
                      <span>{option.label}</span>
                      <small>{option.badge}</small>
                    </label>
                  ))}
                </div>
                {!visibleRegionOptions.length && <div className="picker-menu-empty">No matches.</div>}
              </div>
            )}
          </div>
        }
      >
        <select
          value={registered}
          onChange={(event) => {
            setRegistered(event.target.value);
            setPage(1);
          }}
        >
          <option value="">Any Status</option>
          <option value="true">Registered</option>
          <option value="false">Inactive</option>
        </select>
      </SearchFilters>
      <Panel
        title="Team List"
        icon={<Users />}
        action={
          !isSearchingTeams && (
            <span className="teams-cache-controls">
              {lastUpdated && <span className="teams-cache-time">Updated {formatRelativeTime(lastUpdated)}</span>}
              <button
                type="button"
                className="teams-reload-btn"
                onClick={() => reloadTeamsRef.current()}
                disabled={refreshing}
                title="Reload team list now"
              >
                <RotateCw size={13} className={refreshing ? "spin" : ""} />
                {refreshing ? "Reloading..." : "Reload"}
              </button>
            </span>
          )
        }
      >
        <Status loading={loading} error={error} />
        {refreshing && !loading && <div className="notice subtle">Updating cached teams...</div>}
        <TeamTable teams={tableTeams} loading={loading} localPageSize={50} />
      </Panel>
    </section>
  );
}

function TeamTable({ teams, loading, localPageSize, eventId }: { teams: Team[]; loading: boolean; localPageSize?: number; eventId?: number }) {
  const [page, setPage] = useState(1);
  const [expandedTeamId, setExpandedTeamId] = useState<number | null>(null);
  const totalPages = localPageSize ? Math.max(1, Math.ceil(teams.length / localPageSize)) : 1;
  const visibleTeams = localPageSize ? teams.slice((page - 1) * localPageSize, page * localPageSize) : teams;

  useEffect(() => {
    setPage(1);
    setExpandedTeamId(null);
  }, [teams, localPageSize]);

  return (
    <>
      <table className="team-table">
        <thead>
          <tr>
            <th>Team</th>
            <th>Program</th>
            <th>Level</th>
            <th>Organization</th>
            <th>Location</th>
            <th>
              <span
                className="status-disclaimer"
                data-tooltip="Push Back Season registration status. Override registrations will be updated soon."
              >
                Status
              </span>
            </th>
            <th className="quick-look-col"></th>
          </tr>
        </thead>
        {loading ? (
          <LoadingTable columns={7} />
        ) : (
          <tbody>
            {visibleTeams.map((team) => {
              const expanded = expandedTeamId === team.id;
              return (
                <Fragment key={team.id}>
                  <tr key={team.id} className="team-row" onClick={() => navigate(teamPath(team))}>
                    <td className="team-cell truncate-cell">
                      <span className="team-number">{team.number}</span>
                      {team.team_name && <span>{team.team_name}</span>}
                    </td>
                    <td>
                      <ProgramBadge program={team.program} />
                    </td>
                    <td>
                      <GradeBadge grade={team.grade} />
                    </td>
                    <td className="truncate-cell">{team.organization || "-"}</td>
                    <td className="truncate-cell">{locationLine(team)}</td>
                    <td>{team.registered ? "Registered" : "Inactive"}</td>
                    <td
                      className="quick-look-col"
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedTeamId(expanded ? null : team.id);
                      }}
                    >
                      <button className={`quick-look-btn${expanded ? " active" : ""}`}>
                        <PanelRight size={14} />
                        Quick look
                      </button>
                    </td>
                  </tr>
                  {expanded && (
                    <tr key={`${team.id}-details`} className="team-detail-row">
                      <td colSpan={7}>
                        <div className="team-detail-content">
                          <div className="team-detail-top">
                            <div>
                              <div>
                                <strong>{team.number}</strong>
                                {team.team_name && <span> - {team.team_name}</span>}
                              </div>
                              <div>{team.organization || "No organization listed"}</div>
                              <div>
                                {locationLine(team)} · {team.grade ?? "Grade unknown"} · {team.registered ? "Registered" : "Inactive"}
                              </div>
                            </div>
                            <button className="quick-look-close" onClick={() => setExpandedTeamId(null)}>✕</button>
                          </div>
                          <TeamRowMatchesPreview teamId={team.id} eventId={eventId} />
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {!teams.length && (
              <tr>
                <td colSpan={7}>
                  <Empty />
                </td>
              </tr>
            )}
          </tbody>
        )}
      </table>
      {!loading && localPageSize && (
        <div className="pager-with-total">
          <span>{teams.length.toLocaleString()} teams loaded</span>
          <LocalPager page={page} totalPages={totalPages} onPage={setPage} />
        </div>
      )}
    </>
  );
}

function TeamRowMatchesPreview({ teamId, eventId }: { teamId: number; eventId?: number }) {
  const { data, loading, error } = useAsync(
    async () => {
      if (eventId) return api.teamMatches(teamId, { "event[]": [eventId], per_page: 250, page: 1 });

      const firstPage = await api.teamMatches(teamId, { per_page: 50, page: 1 });
      const lastPage = firstPage.meta.last_page;
      const pages = [lastPage - 1, lastPage].filter((page, index, allPages) => page > 1 && allPages.indexOf(page) === index);
      const recentPages = pages.length ? await Promise.all(pages.map((page) => api.teamMatches(teamId, { per_page: 50, page }))) : [];
      const matches = uniqueMatches([firstPage, ...recentPages].flatMap((page) => page.data))
        .sort((a, b) => matchTimestampMs(b) - matchTimestampMs(a) || compareMatchesDisplay(b, a))
        .slice(0, 6);

      return { ...firstPage, data: matches };
    },
    [teamId, eventId],
  );
  const matches = data?.data ?? [];

  if (loading) return <div className="muted">Loading matches...</div>;
  if (error) return <div className="muted">Could not load matches.</div>;
  if (!matches.length) return <div className="muted">{eventId ? "No matches in this event." : "No recent matches."}</div>;

  return (
    <div className="team-preview-matches">
      <div className="team-preview-title">{eventId ? "Event matches" : "Recent matches"}</div>
      <table>
        <tbody>
          {matches.map((match) => {
            const { red, blue, redScore, blueScore, winner } = matchWinner(match);
            return (
              <tr key={match.id}>
                <td>
                  <Link href={`/event/${match.event.code ?? match.event.id}`}>{match.event.name}</Link>
                  <span className="muted inline-muted">{match.name}</span>
                </td>
                <td>
                  <AllianceTeamLinks teams={red?.teams} focusTeamId={teamId} />
                </td>
                <td>
                  <AllianceTeamLinks teams={blue?.teams} focusTeamId={teamId} />
                </td>
                <td>
                  <span className={`score red ${winner === "Blue" ? "score-loser" : ""}`}>{redScore ?? "-"}</span>
                  <span className={`score blue ${winner === "Red" ? "score-loser" : ""}`}>{blueScore ?? "-"}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SearchFilters({
  search,
  setSearch,
  onSubmit,
  onFocus,
  program,
  setProgram,
  placeholder,
  quickResults,
  quickLoading,
  quickOpen,
  onPickTeam,
  regionControl,
  children,
}: {
  search: string;
  setSearch: (value: string) => void;
  onSubmit: () => void;
  onFocus: () => void;
  program: string;
  setProgram: (value: string) => void;
  placeholder: string;
  quickResults: Team[];
  quickLoading: boolean;
  quickOpen: boolean;
  onPickTeam: (team: Team) => void;
  regionControl: ReactNode;
  children?: ReactNode;
}) {
  const [visibleCount, setVisibleCount] = useState(20);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Reset visible count when the result set changes (new search query)
  useEffect(() => {
    setVisibleCount(20);
  }, [quickResults]);

  const handleQuickScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 100) {
      setVisibleCount((c) => c + 20);
    }
  }, []);

  const visibleResults = quickResults.slice(0, visibleCount);
  const hasMore = quickResults.length > visibleCount;

  return (
    <form
      className="filters team-filters"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="team-search-wrap">
        <label>
          <Search size={16} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onFocus={onFocus}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onSubmit();
                return;
              }
              if (event.key === "Escape") {
                event.currentTarget.blur();
              }
            }}
            placeholder={placeholder}
          />
        </label>
        <button type="submit" className="team-search-submit" aria-label="Search teams">
          <Search size={16} />
        </button>
        {quickOpen && !!search.trim() && (
          <div className="team-quick-results">
            <div
              ref={scrollRef}
              className={quickResults.length > 5 ? "team-quick-scroll" : undefined}
              onScroll={handleQuickScroll}
            >
              {visibleResults.map((team) => (
                <button type="button" key={team.id} onMouseDown={(event) => event.preventDefault()} onClick={() => onPickTeam(team)}>
                  <span>
                    <strong>{team.number}</strong>
                    {team.team_name && <span> - {team.team_name}</span>}
                  </span>
                  <small>{[team.program?.name, team.grade, locationLine(team)].filter(Boolean).join(" · ")}</small>
                </button>
              ))}
              {quickLoading && !quickResults.length && <div className="team-quick-empty">Searching...</div>}
              {!quickLoading && !quickResults.length && <div className="team-quick-empty">No quick matches.</div>}
            </div>
            {hasMore && (
              <div className="team-quick-more-hint" aria-hidden="true">
                Scroll to see more ↓
              </div>
            )}
          </div>
        )}
      </div>
      <select value={program} onChange={(event) => setProgram(event.target.value)}>
        {programOptions.map((option) => (
          <option key={option.value || "all"} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {regionControl}
      {children}
    </form>
  );
}

function PageTitle({ icon, title, subtitle }: { icon: ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="page-title">
      <h1>
        {icon}
        {title}
      </h1>
      {subtitle && <p>{subtitle}</p>}
    </div>
  );
}

function EventDetail({ param }: { param: string }) {
  const [focusTeam, setFocusTeam] = useState<{ id: number; number: string } | null>(() => {
    const params = new URLSearchParams(window.location.search);
    const teamId = params.get("focusTeam");
    const teamNum = params.get("focusTeamNum");
    if (teamId && teamNum) return { id: Number(teamId), number: decodeURIComponent(teamNum) };
    return null;
  });
  const [tab, setTab] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("focusTeam") ? "team-matches" : "matches";
  });
  const [selectedDivision, setSelectedDivision] = useState<number | null>(null);
  const [playback, setPlayback] = useState<MatchPlayback | null>(null);
  const lookup = useAsync(async () => {
    if (allDigits(param)) return api.event(param);
    const res = await api.events({ "sku[]": param, per_page: 1 });
    return res.data[0] ?? null;
  }, [param]);
  const event = lookup.data ?? null;
  const loading = lookup.loading;
  const error = lookup.error ?? (!loading && !event ? "Event not found" : null);
  const id = event ? String(event.id) : "";
  const divisions = useMemo(() => [...(event?.divisions ?? [])].sort((a, b) => (a.order ?? a.id) - (b.order ?? b.id)), [event]);
  const division = selectedDivision ?? divisions[0]?.id ?? 1;
  const awards = useAsync(
    async () => {
      if (!event) return null;
      return collectAllPages<Award>((page) => api.eventAwards(id, { per_page: 250, page }));
    },
    [id, event?.id],
  );
  const matches = useAsync(
    async () => {
      if (!event) return null;
      return collectAllPages<Match>((page) => api.eventMatches(id, division, { per_page: 250, page }));
    },
    [id, division, event?.id],
  );
  const rankings = useAsync(
    async () => {
      if (!event) return null;
      return collectAllPages<Ranking>((page) => api.eventRankings(id, division, { per_page: 250, page }));
    },
    [id, division, event?.id],
  );
  const skills = useAsync(
    async () => {
      if (!event) return null;
      return collectAllPages<Skill>((page) => api.eventSkills(id, { per_page: 250, page }));
    },
    [id, event?.id],
  );
  const teams = useAsync(
    async () => {
      if (!event) return null;
      return collectAllPages<Team>((page) => api.eventTeams(id, { per_page: 250, page }));
    },
    [id, event?.id],
  );
  const preset = useAsync(
    async () => {
      if (!event) return null;
      return api.jumperPresetEventExists(event.sku);
    },
    [event?.sku],
  );
  const matchTimestamps = useAsync(
    async () => {
      if (!event || !preset.data?.exists) return null;
      return api.jumperMatchTimestamps(event.sku, { offsetSeconds: -5 });
    },
    [event?.sku, preset.data?.exists],
  );

  const focusTeamEventMatches = useAsync(
    async () => {
      if (!focusTeam || !event) return null;
      return collectAllPages<Match>((page) => api.teamMatches(focusTeam.id, { "event[]": [Number(id)], per_page: 250, page }));
    },
    [focusTeam?.id, id, event?.id],
  );

  const eventAwards = awards.data?.data ?? [];
  const timestampMap = useMemo(() => new Map((matchTimestamps.data ?? []).map((timestamp) => [timestamp.id, timestamp])), [matchTimestamps.data]);
  const presetUrl = event && preset.data?.exists ? `https://jumper.robostem.org/?preset=${encodeURIComponent(jumperPresetName(event, preset.data))}` : null;
  const activeStatus = tab === "team-matches" ? focusTeamEventMatches : tab === "matches" ? matches : tab === "rankings" ? rankings : tab === "skills" ? skills : tab === "awards" ? awards : teams;
  const keyAwards = useMemo(() => highlightAwards(eventAwards, event), [eventAwards, event]);

  useEffect(() => {
    if (!event) return;
    const firstDivision = divisions[0]?.id ?? 1;
    if (!selectedDivision || !divisions.some((item) => item.id === selectedDivision)) {
      setSelectedDivision(firstDivision);
    }
  }, [event?.id, divisions, selectedDivision]);

  if (loading || error || !event) {
    return (
      <section className="page">
        <Status loading={loading} error={error} />
      </section>
    );
  }

  return (
    <ProgramContext.Provider value={programSlug(event.program)}>
    <section className="page">
      <div className="profile-header">
        <div>
          <div className="eyebrow">
            <CalendarDays size={16} /> {event.sku}
          </div>
          <h1>{event.name}</h1>
          <p>
            {event.location.venue ? `${event.location.venue} · ` : ""}
            {locationLine(event)}
          </p>
          <div className="meta-line">
            <ProgramBadge program={event.program} />
            <span>{formatDate(event.start)} - {formatDate(event.end)}</span>
            <span>{shortSeasonName(event.season.name)}</span>
            <span className={`event-priority priority-${eventCategory(event).rank}`}>{eventCategory(event).label}</span>
          </div>
        </div>
        <FavoriteButton id={event.id} kind="event" />
      </div>

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          ...(focusTeam
            ? [
                [
                  "team-matches",
                  `${focusTeam.number}'s Matches`,
                  <Gamepad2 size={15} />,
                  () => {
                    setFocusTeam(null);
                    setTab("matches");
                    window.history.replaceState(null, "", eventPath(event));
                  },
                ] as [string, string, ReactNode, () => void],
              ]
            : []),
          ["matches", "Results", <Gamepad2 size={15} />],
          ["rankings", "Rankings", <BarChart3 size={15} />],
          ["skills", "Skills", <Activity size={15} />],
          ["awards", "Awards", <AwardIcon size={15} />],
          ["teams", `Teams ${teams.data?.meta.total ?? ""}`, <Users size={15} />],
        ]}
      />
      {keyAwards.length > 0 && <EventHighlights awards={keyAwards} />}
      {divisions.length > 1 && (tab === "matches" || tab === "rankings") && (
        <div className="division-tabs" aria-label="Event divisions">
          <span>Division</span>
          {divisions.map((item) => (
            <button
              key={item.id}
              className={item.id === division ? "active" : ""}
              onClick={() => setSelectedDivision(item.id)}
            >
              {item.name}
            </button>
          ))}
        </div>
      )}
      <Status loading={activeStatus.loading} error={activeStatus.error} />
      {tab === "team-matches" && focusTeam && (
        <Panel title={`${focusTeam.number}'s Matches at this Event`} icon={<Gamepad2 />}>
          <TeamMatchTable matches={focusTeamEventMatches.data?.data ?? []} focusTeamId={focusTeam.id} isIq={isIqProgram(event)} />
        </Panel>
      )}
      {tab === "matches" && (
        <MatchesTable
          matches={matches.data?.data ?? []}
          timestampMap={timestampMap}
          presetSupported={!!preset.data?.exists}
          presetLoading={preset.loading || (preset.data?.exists ? matchTimestamps.loading : false)}
          presetUrl={presetUrl}
          onOpenMatch={(match, timestamp) => setPlayback({ match, timestamp })}
          isIq={isIqProgram(event)}
        />
      )}
      {tab === "rankings" && <RankingsTable rankings={rankings.data?.data ?? []} isIq={isIqProgram(event)} matches={matches.data?.data ?? []} />}
      {tab === "skills" && <SkillsTable skills={skills.data?.data ?? []} />}
      {tab === "awards" && <AwardsList awards={awards.data?.data ?? []} />}
      {tab === "teams" && !teams.loading && teams.data && (
        <div className="table-summary">Showing 80 per page from {teams.data.data.length.toLocaleString()} RobotEvents teams.</div>
      )}
      {tab === "teams" && <TeamTable teams={teams.data?.data ?? []} loading={teams.loading} localPageSize={80} eventId={event.id} />}
      {playback && <MatchVideoOverlay playback={playback} onClose={() => setPlayback(null)} />}
    </section>
    </ProgramContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Team About tab — profile + season stat cards + lightweight SVG trend charts
// ---------------------------------------------------------------------------

function shortMonthYear(ts: number) {
  if (!ts) return "";
  return new Date(ts).toLocaleDateString(undefined, { month: "short", year: "2-digit" });
}

function useMeasuredWidth() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

type ChartSeries = { name: string; color: string; values: Array<number | null> };

function starPoints(cx: number, cy: number, outer: number, inner: number) {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(`${(cx + r * Math.cos(angle)).toFixed(2)},${(cy + r * Math.sin(angle)).toFixed(2)}`);
  }
  return pts.join(" ");
}

function TrendChart({
  labels,
  tips,
  series,
  markers,
  height = 140,
  area = false,
  yFormat = (n: number) => String(Math.round(n)),
  yFloor,
  yCeil,
  yMaxPad = 0,
}: {
  labels: string[];
  tips?: string[];
  series: ChartSeries[];
  markers?: boolean[];
  height?: number;
  area?: boolean;
  yFormat?: (n: number) => string;
  yFloor?: number;
  yCeil?: number;
  yMaxPad?: number;
}) {
  const { ref, width } = useMeasuredWidth();
  const [hover, setHover] = useState<number | null>(null);
  const n = labels.length;

  const allValues = series.flatMap((s) => s.values.filter((v): v is number => v != null));

  const padL = 44;
  const padR = 10;
  const padT = 20;
  const padB = 10;
  const W = Math.max(width, 1);
  const innerW = Math.max(W - padL - padR, 1);
  const innerH = Math.max(height - padT - padB, 1);

  const lo = yFloor ?? (allValues.length ? Math.min(...allValues) : 0);
  let hi = yCeil ?? (allValues.length ? Math.max(...allValues) : 1);
  if (hi === lo) {
    hi = lo + 1;
  } else if (yCeil == null) {
    hi = hi + (hi - lo) * yMaxPad;
  }

  const xAt = (i: number) => (n <= 1 ? padL + innerW / 2 : padL + (i / (n - 1)) * innerW);
  const yAt = (v: number) => padT + innerH - ((v - lo) / (hi - lo)) * innerH;

  if (!n || !allValues.length) {
    return (
      <div ref={ref} className="about-chart-empty">
        No data for this season.
      </div>
    );
  }

  const hoverYs =
    hover != null
      ? series
          .map((s) => s.values[hover])
          .filter((v): v is number => v != null)
          .map((v) => yAt(v))
      : [];
  const hoverY = hoverYs.length ? Math.min(...hoverYs) : padT;

  return (
    <div ref={ref} className="about-chart" onMouseLeave={() => setHover(null)}>
      {width > 0 && (
        <svg width={W} height={height} role="img" aria-hidden="true">
          {[0, 0.25, 0.5, 0.75, 1].map((t) => {
            const y = padT + innerH * t;
            const val = hi - t * (hi - lo);
            return (
              <g key={t}>
                <line x1={padL} y1={y} x2={W - padR} y2={y} className="about-chart-grid" />
                <text x={padL - 16} y={y + 3} textAnchor="end" className="about-chart-ylabel">
                  {yFormat(val)}
                </text>
              </g>
            );
          })}
          {series.map((s, si) => {
            const pts = s.values.map((v, i) => (v == null ? null : { x: xAt(i), y: yAt(v) }));
            const segments: string[] = [];
            let cur: string[] = [];
            pts.forEach((p) => {
              if (p) {
                cur.push(`${cur.length ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`);
              } else if (cur.length) {
                segments.push(cur.join(" "));
                cur = [];
              }
            });
            if (cur.length) segments.push(cur.join(" "));
            const linePath = segments.join(" ");
            const firstPt = pts.find((p) => p);
            const lastPt = [...pts].reverse().find((p) => p);
            const baseline = (padT + innerH).toFixed(1);
            const areaPath =
              area && firstPt && lastPt
                ? `${linePath} L${lastPt.x.toFixed(1)} ${baseline} L${firstPt.x.toFixed(1)} ${baseline} Z`
                : "";
            return (
              <g key={si}>
                {area && areaPath && <path d={areaPath} fill={s.color} className="about-chart-area" />}
                <path d={linePath} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                {pts.map((p, i) => {
                  if (!p) return null;
                  const big = hover === i;
                  if (markers?.[i]) {
                    const outer = big ? 7 : 5.5;
                    return (
                      <polygon
                        key={i}
                        points={starPoints(p.x, p.y, outer, outer * 0.42)}
                        fill="#fff"
                        stroke={s.color}
                        strokeWidth={2}
                        strokeLinejoin="round"
                      />
                    );
                  }
                  return <circle key={i} cx={p.x} cy={p.y} r={big ? 4.5 : 3} fill="#fff" stroke={s.color} strokeWidth={2} />;
                })}
              </g>
            );
          })}
          {hover != null && <line x1={xAt(hover)} y1={padT} x2={xAt(hover)} y2={padT + innerH} className="about-chart-guide" />}
          {labels.map((_, i) => {
            const bandW = n <= 1 ? innerW : innerW / (n - 1);
            return (
              <rect key={i} x={xAt(i) - bandW / 2} y={0} width={bandW} height={height} fill="transparent" onMouseEnter={() => setHover(i)} />
            );
          })}
        </svg>
      )}
      <div className="about-chart-xaxis" style={{ paddingLeft: padL, paddingRight: padR }}>
        <span>{labels[0]}</span>
        {n > 1 && <span>{labels[n - 1]}</span>}
      </div>
      {hover != null && (
        <div className={`about-chart-tip${hoverY < 70 ? " below" : ""}`} style={{ left: `${(xAt(hover) / W) * 100}%`, top: hoverY }}>
          <strong>{tips?.[hover] ?? labels[hover]}</strong>
          {series.map((s) => (
            <span key={s.name}>
              <i style={{ background: s.color }} /> {s.name}: <b>{s.values[hover] == null ? "—" : yFormat(s.values[hover] as number)}</b>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  accent = "gray",
  icon,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  accent?: "blue" | "green" | "amber" | "red" | "gray";
  icon?: ReactNode;
}) {
  return (
    <div className="about-stat" data-accent={accent}>
      <div className="about-stat-label">
        {icon}
        <span>{label}</span>
      </div>
      <strong className="about-stat-value">{value}</strong>
      {sub != null && <small className="about-stat-sub">{sub}</small>}
    </div>
  );
}

function AboutProfileRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="about-profile-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function TeamAboutTab({
  team,
  isIq,
  seasonId,
  seasonLabel,
  rankings,
  skills,
  allEvents,
  eventIndex,
  loading,
}: {
  team: Team;
  isIq: boolean;
  seasonId: number | null;
  seasonLabel?: string;
  rankings: Ranking[];
  skills: Skill[];
  allEvents: Event[];
  eventIndex: Map<number, Event>;
  loading: boolean;
}) {
  const grade = team.grade ?? "";
  const worldSkills = useAsync(async () => {
    if (!seasonId || !grade) return null;
    return loadWorldSkills(seasonId, grade);
  }, [seasonId, grade]);

  const wsEntry = useMemo(() => {
    if (!worldSkills.data) return null;
    return (
      worldSkills.data.find((e) => e.team.id === team.id) ??
      worldSkills.data.find((e) => e.team.team?.toUpperCase() === team.number.toUpperCase()) ??
      null
    );
  }, [worldSkills.data, team.id, team.number]);

  const years = useMemo(() => {
    const ys = allEvents.map((e) => (e.start ? new Date(e.start).getFullYear() : 0)).filter((y) => y > 0);
    if (!ys.length) return null;
    return { first: Math.min(...ys), last: Math.max(...ys) };
  }, [allEvents]);

  const rankRows = useMemo(() => {
    const dateOf = (eventId: number) => {
      const ev = eventIndex.get(eventId);
      return ev?.start ? new Date(ev.start).getTime() : 0;
    };
    return [...rankings]
      .filter((r) => !isScrimmageEvent(eventIndex.get(r.event.id)))
      .sort((a, b) => dateOf(a.event.id) - dateOf(b.event.id))
      .map((r) => {
        const wins = r.wins ?? 0;
        const losses = r.losses ?? 0;
        const ties = r.ties ?? 0;
        const matches = wins + losses + ties;
        const wp = r.wp ?? 0;
        return {
          name: eventIndex.get(r.event.id)?.name ?? r.event.name ?? `Event ${r.event.id}`,
          date: dateOf(r.event.id),
          marquee: isMarqueeEvent(eventIndex.get(r.event.id)),
          wins,
          losses,
          ties,
          matches,
          wp,
          awp: Math.max(0, wp - (wins * 2 + ties)),
          winRate: matches ? wins / matches : 0,
          avgWp: matches ? wp / matches : 0,
          avgPoints: r.average_points ?? 0,
          highScore: r.high_score ?? 0,
        };
      });
  }, [rankings, eventIndex]);

  const skillRows = useMemo(() => {
    const dateOf = (eventId: number) => {
      const ev = eventIndex.get(eventId);
      return ev?.start ? new Date(ev.start).getTime() : 0;
    };
    const byEvent = new Map<number, { driver: number; prog: number }>();
    skills.forEach((s) => {
      if (isScrimmageEvent(eventIndex.get(s.event.id))) return;
      const cur = byEvent.get(s.event.id) ?? { driver: 0, prog: 0 };
      const score = s.score ?? 0;
      if ((s.type ?? "").toLowerCase().includes("driver")) cur.driver = Math.max(cur.driver, score);
      else cur.prog = Math.max(cur.prog, score);
      byEvent.set(s.event.id, cur);
    });
    return [...byEvent.entries()]
      .map(([eventId, v]) => ({
        name: eventIndex.get(eventId)?.name ?? `Event ${eventId}`,
        date: dateOf(eventId),
        marquee: isMarqueeEvent(eventIndex.get(eventId)),
        driver: v.driver,
        prog: v.prog,
        combined: v.driver + v.prog,
      }))
      .sort((a, b) => a.date - b.date);
  }, [skills, eventIndex]);

  const agg = useMemo(() => {
    const wins = rankRows.reduce((s, r) => s + r.wins, 0);
    const losses = rankRows.reduce((s, r) => s + r.losses, 0);
    const ties = rankRows.reduce((s, r) => s + r.ties, 0);
    const matches = wins + losses + ties;
    const wp = rankRows.reduce((s, r) => s + r.wp, 0);
    const awp = rankRows.reduce((s, r) => s + r.awp, 0);
    const bestDriver = skillRows.reduce((m, r) => Math.max(m, r.driver), 0);
    const bestProg = skillRows.reduce((m, r) => Math.max(m, r.prog), 0);
    const avgPoints = rankRows.length ? rankRows.reduce((s, r) => s + r.avgPoints, 0) / rankRows.length : 0;
    const highScore = rankRows.reduce((m, r) => Math.max(m, r.highScore), 0);
    return {
      wins,
      losses,
      ties,
      matches,
      wp,
      awp,
      winRate: matches ? wins / matches : 0,
      avgWp: matches ? wp / matches : 0,
      bestDriver,
      bestProg,
      bestCombined: bestDriver + bestProg,
      avgPoints,
      highScore,
      events: rankRows.length,
    };
  }, [rankRows, skillRows]);

  if (loading && !rankRows.length && !skillRows.length) {
    return (
      <div className="about-wrap">
        <Status loading={true} error={null} />
      </div>
    );
  }

  const winRateAccent = agg.winRate >= 0.6 ? "green" : agg.winRate >= 0.4 ? "amber" : "red";
  const wsValue = worldSkills.loading ? "…" : wsEntry ? `#${wsEntry.rank.toLocaleString()}` : "Unranked";
  const wsSub = worldSkills.loading
    ? "Loading leaderboard…"
    : wsEntry
      ? `${wsEntry.scores.score} pts · ${grade}`
      : worldSkills.error
        ? "Leaderboard unavailable"
        : "No ranked skills run";

  const hasComp = rankRows.length > 0;
  const hasSkills = skillRows.some((r) => r.combined > 0);

  return (
    <div className="about-wrap">
      <Panel title="Team Profile" icon={<Info size={18} />}>
        <dl className="about-profile">
          <AboutProfileRow label="Location">{locationLine(team) || "—"}</AboutProfileRow>
          <AboutProfileRow label="Grade">{team.grade || "Unknown"}</AboutProfileRow>
          <AboutProfileRow label="Program">
            <ProgramBadge program={team.program} />
          </AboutProfileRow>
          <AboutProfileRow label="Status">
            <span className={`about-status ${team.registered ? "active" : "inactive"}`}>{team.registered ? "Active" : "Inactive"}</span>
          </AboutProfileRow>
          <AboutProfileRow label="Years Active">
            {years ? (years.first === years.last ? `${years.first}` : `${years.first} – ${team.registered ? "present" : years.last}`) : "—"}
          </AboutProfileRow>
        </dl>
      </Panel>

      <div className="about-stats">
        <StatCard label="World Skills" accent="blue" icon={<Medal size={14} />} value={wsValue} sub={wsSub} />
        <StatCard
          label="Best Skills Score"
          accent="blue"
          icon={<Activity size={14} />}
          value={agg.bestCombined || "—"}
          sub={agg.bestCombined ? `${agg.bestDriver} driver · ${agg.bestProg} auton` : "No skills runs"}
        />
        <StatCard label="Events" accent="gray" icon={<CalendarDays size={14} />} value={agg.events || "—"} sub={seasonLabel} />
        {isIq ? (
          <>
            <StatCard label="Avg Qualifying Score" accent="green" icon={<BarChart3 size={14} />} value={agg.avgPoints ? agg.avgPoints.toFixed(1) : "—"} sub="Across events" />
            <StatCard label="High Score" accent="amber" icon={<Trophy size={14} />} value={agg.highScore || "—"} sub="Best qualifying match" />
            <StatCard label="Matches" accent="gray" icon={<Gamepad2 size={14} />} value={agg.matches || "—"} sub={`${agg.events} events`} />
          </>
        ) : (
          <>
            <StatCard label="Win Rate" accent={winRateAccent} icon={<BarChart3 size={14} />} value={agg.matches ? `${Math.round(agg.winRate * 100)}%` : "—"} sub={agg.matches ? `${agg.wins}-${agg.losses}-${agg.ties} record` : "No matches"} />
            <StatCard label="Total Matches" accent="gray" icon={<Gamepad2 size={14} />} value={agg.matches || "—"} sub={`${agg.events} events`} />
            <StatCard label="Autonomous WP" accent="green" icon={<Trophy size={14} />} value={agg.awp} sub={`${agg.avgWp.toFixed(1)} avg WP / match`} />
          </>
        )}
      </div>

      {!hasComp && !hasSkills ? (
        <Panel title="Performance" icon={<BarChart3 size={18} />}>
          <div className="about-panel-body">
            <div className="about-chart-empty">No competition or skills data recorded for this season yet.</div>
          </div>
        </Panel>
      ) : (
        <div className="about-charts">
          {!isIq && hasComp && (
            <Panel title="Win Rate Over Time" icon={<BarChart3 size={18} />}>
              <div className="about-panel-body">
                <TrendChart
                  area
                  labels={rankRows.map((r) => shortMonthYear(r.date))}
                  tips={rankRows.map((r) => r.name)}
                  series={[{ name: "Win rate", color: "#337ab7", values: rankRows.map((r) => r.winRate * 100) }]}
                  markers={rankRows.map((r) => r.marquee)}
                  yFloor={0}
                  yCeil={100}
                  yFormat={(v) => `${Math.round(v)}%`}
                />
              </div>
            </Panel>
          )}

          {hasSkills && (
            <Panel title="Skills Score Over Time" icon={<Activity size={18} />}>
              <div className="about-panel-body">
                <div className="about-legend">
                  <span>
                    <i style={{ background: "#337ab7" }} /> Driver
                  </span>
                  <span>
                    <i style={{ background: "#8e44ad" }} /> Autonomous
                  </span>
                </div>
                <TrendChart
                  labels={skillRows.map((r) => shortMonthYear(r.date))}
                  tips={skillRows.map((r) => r.name)}
                  series={[
                    { name: "Driver", color: "#337ab7", values: skillRows.map((r) => r.driver) },
                    { name: "Autonomous", color: "#8e44ad", values: skillRows.map((r) => r.prog) },
                  ]}
                  markers={skillRows.map((r) => r.marquee)}
                  yFloor={0}
                />
              </div>
            </Panel>
          )}

          {isIq && hasComp && (
            <Panel title="Avg Qualifying Score Over Time" icon={<BarChart3 size={18} />}>
              <div className="about-panel-body">
                <TrendChart
                  area
                  labels={rankRows.map((r) => shortMonthYear(r.date))}
                  tips={rankRows.map((r) => r.name)}
                  series={[{ name: "Avg score", color: "#5cb85c", values: rankRows.map((r) => r.avgPoints) }]}
                  markers={rankRows.map((r) => r.marquee)}
                  yFloor={0}
                  yFormat={(v) => v.toFixed(1)}
                />
              </div>
            </Panel>
          )}

          {!isIq && hasComp && (
            <Panel title="Avg Win Points / Match" icon={<Trophy size={18} />}>
              <div className="about-panel-body">
                <TrendChart
                  labels={rankRows.map((r) => shortMonthYear(r.date))}
                  tips={rankRows.map((r) => r.name)}
                  series={[{ name: "Avg WP", color: "#f0ad4e", values: rankRows.map((r) => r.avgWp) }]}
                  markers={rankRows.map((r) => r.marquee)}
                  yFloor={0}
                  yFormat={(v) => v.toFixed(1)}
                />
              </div>
            </Panel>
          )}

          {!isIq && hasComp && (
            <Panel title="Autonomous Win Points Per Event" icon={<Medal size={18} />}>
              <div className="about-panel-body">
                <TrendChart
                  area
                  labels={rankRows.map((r) => shortMonthYear(r.date))}
                  tips={rankRows.map((r) => `${r.name} — ${r.awp} AWP`)}
                  series={[{ name: "AWP", color: "#5cb85c", values: rankRows.map((r) => r.awp) }]}
                  markers={rankRows.map((r) => r.marquee)}
                  yFloor={0}
                />
              </div>
            </Panel>
          )}
        </div>
      )}
    </div>
  );
}

function TeamDetail({ param }: { param: string }) {
  const [tab, setTab] = useState("about");
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(null);
  const [dateDirection, setDateDirection] = useState<DateDirection>("asc");
  const [focusedEventId, setFocusedEventId] = useState<number | null>(null);
  const [matchesBySeason, setMatchesBySeason] = useState<Record<number, AsyncBucket<Match>>>({});
  const [rankingsBySeason, setRankingsBySeason] = useState<Record<number, AsyncBucket<Ranking>>>({});
  const [skillsBySeason, setSkillsBySeason] = useState<Record<number, AsyncBucket<Skill>>>({});
  const [awardsBySeason, setAwardsBySeason] = useState<Record<number, AsyncBucket<Award>>>({});
  const inFlightTeamData = useRef(new Set<string>());
  const lookup = useAsync(async () => {
    const parts = param.split("/").filter(Boolean).map(decodeURIComponent);
    const [a, b] = parts;
    const programCode = b ? a : undefined;
    const numberOrId = (b ?? a) ?? "";
    if (!programCode && allDigits(numberOrId)) return api.team(numberOrId);
    const res = await api.robotEventsTeams({ number: numberOrId.toUpperCase(), "program[]": vexProgramIds, per_page: 50 });
    let list = res.data;
    if (programCode) list = list.filter((entry) => programMatchesSlug(entry.program, programCode));
    return list[0] ?? null;
  }, [param]);
  const team = lookup.data ?? null;
  const loading = lookup.loading;
  const error = lookup.error ?? (!loading && !team ? "Team not found" : null);
  const id = team ? String(team.id) : "";
  const events = useAsync(
    async () => {
      if (!team) return null;
      return collectAllPages<Event>((page) => api.teamEvents(id, { per_page: 250, page }));
    },
    [id, team?.id],
  );
  const teamEvents = events.data?.data ?? [];
  const eventIndex = useMemo(() => makeEventIndex(teamEvents), [teamEvents]);
  const seasonOptions = useMemo(() => {
    const bySeason = new Map<number, { id: number; label: string; latest: number; count: number }>();

    teamEvents.forEach((event) => {
      const latest = new Date(event.start ?? 0).getTime();
      const existing = bySeason.get(event.season.id);
      if (!existing) {
        bySeason.set(event.season.id, { id: event.season.id, label: shortSeasonName(event.season.name), latest, count: 1 });
        return;
      }

      existing.latest = Math.max(existing.latest, latest);
      existing.count += 1;
    });

    return [...bySeason.values()].sort((a, b) => b.latest - a.latest || b.id - a.id);
  }, [teamEvents]);
  const seasonEvents = useMemo(
    () => teamEvents.filter((event) => !selectedSeasonId || event.season.id === selectedSeasonId).sort(compareEventsByDirection(dateDirection)),
    [dateDirection, teamEvents, selectedSeasonId],
  );
  const selectedSeason = seasonOptions.find((season) => season.id === selectedSeasonId);
  const selectedMatches = selectedSeasonId ? (matchesBySeason[selectedSeasonId] ?? emptyBucket<Match>()) : emptyBucket<Match>();
  const selectedRankings = selectedSeasonId ? (rankingsBySeason[selectedSeasonId] ?? emptyBucket<Ranking>()) : emptyBucket<Ranking>();
  const selectedSkills = selectedSeasonId ? (skillsBySeason[selectedSeasonId] ?? emptyBucket<Skill>()) : emptyBucket<Skill>();
  const selectedAwards = selectedSeasonId ? (awardsBySeason[selectedSeasonId] ?? emptyBucket<Award>()) : emptyBucket<Award>();
  const activeStatus =
    tab === "about"
      ? selectedRankings
      : tab === "events"
        ? events
        : tab === "matches"
          ? selectedMatches
          : tab === "rankings"
            ? selectedRankings
            : tab === "skills"
              ? selectedSkills
              : selectedAwards;

  useEffect(() => {
    if (seasonOptions[0] && (!selectedSeasonId || !seasonOptions.some((season) => season.id === selectedSeasonId))) {
      setSelectedSeasonId(seasonOptions[0].id);
    }
  }, [selectedSeasonId, seasonOptions]);

  useEffect(() => {
    setMatchesBySeason({});
    setRankingsBySeason({});
    setSkillsBySeason({});
    setAwardsBySeason({});
    inFlightTeamData.current.clear();
  }, [id]);

  useEffect(() => {
    if (!team || !seasonOptions.length) return;
    const seasonIds = new Set<number>(seasonOptions.slice(0, 2).map((season) => season.id));
    if (selectedSeasonId) seasonIds.add(selectedSeasonId);

    const markLoading = <T,>(setter: Dispatch<SetStateAction<Record<number, AsyncBucket<T>>>>, seasonId: number) => {
      setter((current) => ({ ...current, [seasonId]: { ...(current[seasonId] ?? emptyBucket<T>()), loading: true, error: null } }));
    };

    const markDone = <T,>(setter: Dispatch<SetStateAction<Record<number, AsyncBucket<T>>>>, seasonId: number, data: T[]) => {
      setter((current) => ({ ...current, [seasonId]: { data, loading: false, error: null } }));
    };

    const markError = <T,>(setter: Dispatch<SetStateAction<Record<number, AsyncBucket<T>>>>, seasonId: number, message: string) => {
      setter((current) => ({ ...current, [seasonId]: { ...(current[seasonId] ?? emptyBucket<T>()), loading: false, error: message } }));
    };

    seasonIds.forEach((seasonId) => {
      const tasks: Array<{
        kind: TeamDataKind;
        loaded: boolean;
        run: () => Promise<unknown[]>;
        markLoading: () => void;
        markDone: (data: unknown[]) => void;
        markError: (message: string) => void;
      }> = [
        {
          kind: "matches",
          loaded: !!matchesBySeason[seasonId],
          run: async () => (await collectAllPages<Match>((page) => api.teamMatches(id, { "season[]": [seasonId], per_page: 250, page }))).data,
          markLoading: () => markLoading(setMatchesBySeason, seasonId),
          markDone: (data) => markDone(setMatchesBySeason, seasonId, data as Match[]),
          markError: (message) => markError(setMatchesBySeason, seasonId, message),
        },
        {
          kind: "rankings",
          loaded: !!rankingsBySeason[seasonId],
          run: async () => (await collectAllPages<Ranking>((page) => api.teamRankings(id, { "season[]": [seasonId], per_page: 250, page }))).data,
          markLoading: () => markLoading(setRankingsBySeason, seasonId),
          markDone: (data) => markDone(setRankingsBySeason, seasonId, data as Ranking[]),
          markError: (message) => markError(setRankingsBySeason, seasonId, message),
        },
        {
          kind: "skills",
          loaded: !!skillsBySeason[seasonId],
          run: async () => (await collectAllPages<Skill>((page) => api.teamSkills(id, { "season[]": [seasonId], per_page: 250, page }))).data,
          markLoading: () => markLoading(setSkillsBySeason, seasonId),
          markDone: (data) => markDone(setSkillsBySeason, seasonId, data as Skill[]),
          markError: (message) => markError(setSkillsBySeason, seasonId, message),
        },
        {
          kind: "awards",
          loaded: !!awardsBySeason[seasonId],
          run: async () => (await collectAllPages<Award>((page) => api.teamAwards(id, { "season[]": [seasonId], per_page: 250, page }))).data,
          markLoading: () => markLoading(setAwardsBySeason, seasonId),
          markDone: (data) => markDone(setAwardsBySeason, seasonId, data as Award[]),
          markError: (message) => markError(setAwardsBySeason, seasonId, message),
        },
      ];

      tasks.forEach((task) => {
        const key = `${id}:${seasonId}:${task.kind}`;
        if (task.loaded || inFlightTeamData.current.has(key)) return;
        inFlightTeamData.current.add(key);
        task.markLoading();
        task
          .run()
          .then(task.markDone)
          .catch((err: Error) => task.markError(err.message))
          .finally(() => inFlightTeamData.current.delete(key));
      });
    });
  }, [
    awardsBySeason,
    id,
    matchesBySeason,
    rankingsBySeason,
    seasonOptions,
    selectedSeasonId,
    skillsBySeason,
    team,
  ]);

  if (loading || error || !team) {
    return (
      <section className="page">
        <Status loading={loading} error={error} />
      </section>
    );
  }

  const isIq = isIqProgramInfo(team.program);

  return (
    <ProgramContext.Provider value={programSlug(team.program)}>
    <section className="page">
      <div className="profile-header">
        <div>
          <div className="eyebrow">
            <Users size={16} /> Team {team.number}
          </div>
          <h1>
            {team.number}
            {team.team_name ? ` - ${team.team_name}` : ""}
          </h1>
          <p>{team.organization || team.robot_name || "VEX Robotics team"}</p>
          <div className="meta-line">
            <ProgramBadge program={team.program} />
            <span>{locationLine(team)}</span>
            <span>{team.grade ?? "Grade unknown"}</span>
            <span>{team.registered ? "Registered" : "Inactive"}</span>
          </div>
        </div>
        <FavoriteButton id={team.id} kind="team" />
      </div>

      <Tabs
        active={tab}
        onChange={(nextTab) => {
          if (nextTab === "matches") setFocusedEventId(null);
          setTab(nextTab);
        }}
        tabs={[
          ["about", "About", <Info size={15} />],
          ["events", `Events ${seasonEvents.length || ""}`, <CalendarDays size={15} />],
          ["matches", "Matches", <Gamepad2 size={15} />],
          ["rankings", "Rankings", <BarChart3 size={15} />],
          ["skills", "Skills", <Activity size={15} />],
          ["awards", "Awards", <AwardIcon size={15} />],
        ]}
      />
      <SeasonSelector
        seasons={seasonOptions}
        selectedSeasonId={selectedSeasonId}
        onChange={setSelectedSeasonId}
        loading={events.loading}
      />
      {tab !== "about" && <DateDirectionToggle direction={dateDirection} onChange={setDateDirection} />}
      {tab !== "about" && <Status loading={activeStatus.loading} error={activeStatus.error} />}
      {tab !== "about" && !activeStatus.loading && !events.loading && selectedSeason && (
        <div className="table-summary">
          Showing {selectedSeason.label} only. Change season to review another year.
        </div>
      )}
      {tab === "about" && (
        <TeamAboutTab
          team={team}
          isIq={isIq}
          seasonId={selectedSeasonId}
          seasonLabel={selectedSeason?.label}
          rankings={selectedRankings.data}
          skills={selectedSkills.data}
          allEvents={teamEvents}
          eventIndex={eventIndex}
          loading={
            events.loading ||
            (selectedSeasonId != null && (!rankingsBySeason[selectedSeasonId] || !skillsBySeason[selectedSeasonId])) ||
            selectedRankings.loading ||
            selectedSkills.loading
          }
        />
      )}
      {!activeStatus.loading && tab === "events" && (
        <TeamEventTable
          events={seasonEvents}
          loading={events.loading}
          matches={selectedMatches.data}
          rankings={selectedRankings.data}
          skills={selectedSkills.data}
          awards={selectedAwards.data}
          focusTeamId={team.id}
          isIq={isIq}
          detailsLoading={selectedMatches.loading || selectedRankings.loading || selectedSkills.loading || selectedAwards.loading}
          onViewMatches={(eventId) => {
            const ev = eventIndex.get(eventId);
            navigate(`${ev ? eventPath(ev) : `/event/${eventId}`}?focusTeam=${team.id}&focusTeamNum=${encodeURIComponent(team.number)}`);
          }}
        />
      )}
      {!activeStatus.loading && tab === "matches" && (
        <TeamMatchesByEvent
          matches={selectedMatches.data}
          eventIndex={eventIndex}
          seasonId={selectedSeasonId}
          focusTeamId={team.id}
          direction={dateDirection}
          focusedEventId={focusedEventId}
          isIq={isIq}
          onViewMatches={(eventId) => {
            const ev = eventIndex.get(eventId);
            navigate(`${ev ? eventPath(ev) : `/event/${eventId}`}?focusTeam=${team.id}&focusTeamNum=${encodeURIComponent(team.number)}`);
          }}
        />
      )}
      {!activeStatus.loading && tab === "rankings" && (
        <TeamRankingsByEvent
          rankings={selectedRankings.data}
          matches={selectedMatches.data}
          eventIndex={eventIndex}
          seasonId={selectedSeasonId}
          direction={dateDirection}
          focusTeamId={team.id}
          isIq={isIq}
          onViewMatches={(eventId) => {
            const ev = eventIndex.get(eventId);
            navigate(`${ev ? eventPath(ev) : `/event/${eventId}`}?focusTeam=${team.id}&focusTeamNum=${encodeURIComponent(team.number)}`);
          }}
        />
      )}
      {!activeStatus.loading && tab === "skills" && (
        <TeamSkillsByEvent
          skills={selectedSkills.data}
          eventIndex={eventIndex}
          seasonId={selectedSeasonId}
          direction={dateDirection}
          onViewMatches={(eventId) => {
            const ev = eventIndex.get(eventId);
            navigate(`${ev ? eventPath(ev) : `/event/${eventId}`}?focusTeam=${team.id}&focusTeamNum=${encodeURIComponent(team.number)}`);
          }}
        />
      )}
      {!activeStatus.loading && tab === "awards" && (
        <TeamAwardsByEvent
          awards={selectedAwards.data}
          eventIndex={eventIndex}
          seasonId={selectedSeasonId}
          focusTeamId={team.id}
          direction={dateDirection}
          onViewMatches={(eventId) => {
            const ev = eventIndex.get(eventId);
            navigate(`${ev ? eventPath(ev) : `/event/${eventId}`}?focusTeam=${team.id}&focusTeamNum=${encodeURIComponent(team.number)}`);
          }}
        />
      )}
    </section>
    </ProgramContext.Provider>
  );
}

function SeasonSelector({
  seasons,
  selectedSeasonId,
  onChange,
  loading,
}: {
  seasons: Array<{ id: number; label: string; count: number }>;
  selectedSeasonId: number | null;
  onChange: (seasonId: number) => void;
  loading: boolean;
}) {
  if (loading || !seasons.length) return null;

  return (
    <div className="season-toolbar">
      <span>Season</span>
      <select value={selectedSeasonId ?? ""} onChange={(event) => onChange(Number(event.target.value))}>
        {seasons.map((season) => (
          <option key={season.id} value={season.id}>
            {season.label} ({season.count})
          </option>
        ))}
      </select>
    </div>
  );
}

function DateDirectionToggle({ direction, onChange }: { direction: DateDirection; onChange: (direction: DateDirection) => void }) {
  return (
    <div className="date-direction-toggle" aria-label="Date order">
      <span>Order</span>
      <button className={direction === "asc" ? "active" : ""} onClick={() => onChange("asc")}>
        Earlier first
      </button>
      <button className={direction === "desc" ? "active" : ""} onClick={() => onChange("desc")}>
        Later first
      </button>
    </div>
  );
}

function EventGroupTitle({
  eventRef,
  event,
  count,
  onViewMatches,
}: {
  eventRef: { id: number; name: string; code?: string | null };
  event?: Event;
  count: number;
  onViewMatches?: (eventId: number) => void;
}) {
  return (
    <>
      <span>
        {onViewMatches ? (
          <button className="event-group-name-btn" onClick={(e) => { e.preventDefault(); onViewMatches(eventRef.id); }}>
            {eventRef.name}
          </button>
        ) : (
          <Link href={event ? eventPath(event) : `/event/${eventRef.code ?? eventRef.id}`}>{eventRef.name}</Link>
        )}
        <small>{event?.sku ?? eventRef.code ?? ""}</small>
      </span>
      <span className="event-group-meta">
        {event ? formatEventDateRange(event.start, event.end) : "Date unavailable"} · {count.toLocaleString()}
      </span>
    </>
  );
}

const qfSeedPairs = [
  [1, 8],
  [4, 5],
  [2, 7],
  [3, 6],
];

function isTeamInAlliance(alliance: Alliance | undefined, teamId: number) {
  return !!alliance?.teams.some((entry) => entry.team.id === teamId);
}

function teamAllianceColor(match: Match, teamId: number) {
  return match.alliances.find((alliance) => isTeamInAlliance(alliance, teamId))?.color;
}

function teamMatchOutcome(match: Match, teamId: number) {
  const color = teamAllianceColor(match, teamId);
  const { winner } = matchWinner(match);
  if (!color || winner === "-" || winner === "Tie") return null;
  return winner.toLowerCase() === color.toLowerCase() ? "W" : "L";
}

function teamNameFromMatch(match: Match, teamId: number) {
  for (const alliance of match.alliances) {
    const entry = alliance.teams.find((team) => team.team.id === teamId);
    if (entry) return entry.team.name;
  }
  return "Team";
}

function ordinal(value: number) {
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${value}th`;
  const mod10 = value % 10;
  if (mod10 === 1) return `${value}st`;
  if (mod10 === 2) return `${value}nd`;
  if (mod10 === 3) return `${value}rd`;
  return `${value}th`;
}

function divisionFinalWins(matches: Match[], teamId: number) {
  const byDivision = new Map<number, { division: IdInfo; wins: number; losses: number; teamName: string; finalIds: Set<number> }>();

  matches
    .filter((match) => playoffRoundKey(match) === "f" && match.alliances.some((alliance) => isTeamInAlliance(alliance, teamId)))
    .forEach((match) => {
      const outcome = teamMatchOutcome(match, teamId);
      if (!outcome) return;
      const existing = byDivision.get(match.division.id) ?? {
        division: match.division,
        wins: 0,
        losses: 0,
        teamName: teamNameFromMatch(match, teamId),
        finalIds: new Set<number>(),
      };
      existing.finalIds.add(match.id);
      if (outcome === "W") existing.wins += 1;
      if (outcome === "L") existing.losses += 1;
      byDivision.set(match.division.id, existing);
    });

  return new Map(
    [...byDivision.entries()]
      .filter(([, result]) => result.wins > result.losses)
      .map(([divisionId, result]) => [divisionId, result]),
  );
}

function lastFinalIdsByDivision(matches: Match[]) {
  const finals = new Map<number, Match[]>();
  matches
    .filter((match) => playoffRoundKey(match) === "f")
    .forEach((match) => finals.set(match.division.id, [...(finals.get(match.division.id) ?? []), match]));

  return new Map(
    [...finals.entries()].map(([divisionId, divisionFinals]) => [
      divisionId,
      [...divisionFinals].sort((a, b) => (b.instance ?? 0) - (a.instance ?? 0) || b.matchnum - a.matchnum)[0]?.id,
    ]),
  );
}

function playoffImportance(match: Match) {
  const key = playoffRoundKey(match);
  if (key === "f") return 4;
  if (key === "sf") return 3;
  if (key === "qf") return 2;
  if (key === "r16") return 1;
  return 0;
}

function playoffMatchesForTeam(matches: Match[], teamId: number) {
  const preferredDivisionId = preferredTeamDivisionId(matches, teamId);
  return matches
    .filter((match) => playoffImportance(match) > 0 && match.alliances.some((alliance) => isTeamInAlliance(alliance, teamId)))
    .sort((a, b) => compareMatchesDisplay(a, b, preferredDivisionId));
}

function inferElimAlliance(matches: Match[], teamId: number) {
  const bracketGroups: Array<{ key: "r16" | "qf"; seeds: number[][] }> = [
    { key: "r16", seeds: r16SeedPairs },
    { key: "qf", seeds: qfSeedPairs },
  ];

  for (const bracket of bracketGroups) {
    const bracketMatches = matches
      .filter((match) => playoffRoundKey(match) === bracket.key)
      .sort((a, b) => (a.instance ?? 0) - (b.instance ?? 0) || a.matchnum - b.matchnum);

    for (const match of bracketMatches) {
      const seedPair = bracket.seeds[(match.instance ?? 1) - 1];
      if (!seedPair) continue;
      const red = match.alliances.find((alliance) => alliance.color === "red");
      const blue = match.alliances.find((alliance) => alliance.color === "blue");
      const alliance = isTeamInAlliance(red, teamId) ? red : isTeamInAlliance(blue, teamId) ? blue : undefined;
      if (!alliance) continue;

      return {
        seed: alliance.color === "red" ? seedPair[0] : seedPair[1],
        teams: alliance.teams.map((entry) => entry.team),
      };
    }
  }

  return null;
}

function ElimAllianceNotice({ alliance, focusTeamId }: { alliance: { seed: number; teams: IdInfo[] }; focusTeamId: number }) {
  const viewedTeam = alliance.teams.find((team) => team.id === focusTeamId);
  const captain = alliance.teams[0];
  if (!viewedTeam || !captain) return null;

  const seedText = `${ordinal(alliance.seed)} seed`;
  if (captain.id === focusTeamId) {
    const pickedTeams = alliance.teams.filter((team) => team.id !== focusTeamId).map((team) => team.name);
    return (
      <>
        <strong>{viewedTeam.name}</strong> picked {pickedTeams.length ? pickedTeams.join(" · ") : "their alliance"} as {seedText}.
      </>
    );
  }

  return (
    <>
      {captain.name} picked <strong>{viewedTeam.name}</strong> as {seedText}.
    </>
  );
}

function firstElimAllianceNotice(matches: Match[], teamId: number) {
  const checkedDivisions = new Set<number>();
  for (const match of matches.filter((item) => playoffImportance(item) > 0)) {
    if (checkedDivisions.has(match.division.id)) continue;
    checkedDivisions.add(match.division.id);
    const divisionMatches = matches.filter((item) => item.division.id === match.division.id);
    const alliance = inferElimAlliance(divisionMatches, teamId);
    if (alliance) return { matchId: match.id, alliance };
  }
  return null;
}

function bestSkillEntries(skills: Skill[]) {
  const byType = new Map<string, Skill>();
  skills.forEach((skill) => {
    const key = skill.type.toLowerCase();
    const existing = byType.get(key);
    if (!existing || (skill.score ?? -1) > (existing.score ?? -1)) byType.set(key, skill);
  });
  return {
    driver: byType.get("driver"),
    programming: byType.get("programming") ?? byType.get("program"),
  };
}

function skillSummary(skills: Skill[]) {
  const { driver, programming } = bestSkillEntries(skills);
  const ranks = [driver?.rank, programming?.rank].filter((rank): rank is number => rank !== null && rank !== undefined);
  const combined = (driver?.score ?? 0) + (programming?.score ?? 0);
  return {
    rank: ranks.length ? Math.min(...ranks) : null,
    driver,
    programming,
    combined: driver || programming ? combined : null,
  };
}

function SkillScoreAttempt({ label, entry }: { label: string; entry?: Skill }) {
  return (
    <span className="skill-score-attempt">
      <strong>{label}</strong> {entry?.score ?? "-"} <strong>Attempts</strong> {entry?.attempts ?? "-"}
    </span>
  );
}

function TeamEventTable({
  events,
  loading,
  matches,
  rankings,
  skills,
  awards,
  focusTeamId,
  isIq = false,
  detailsLoading,
  onViewMatches,
}: {
  events: Event[];
  loading: boolean;
  matches: Match[];
  rankings: Ranking[];
  skills: Skill[];
  awards: Award[];
  focusTeamId: number;
  isIq?: boolean;
  detailsLoading: boolean;
  onViewMatches: (eventId: number) => void;
}) {
  const [expandedEventId, setExpandedEventId] = useState<number | null>(null);

  useEffect(() => {
    setExpandedEventId(null);
  }, [events]);

  return (
    <table className="team-event-table">
      <thead>
        <tr>
          <th>Event</th>
          <th>Program</th>
          <th>Location</th>
          <th>Dates</th>
          <th>Level</th>
        </tr>
      </thead>
      {loading ? (
        <LoadingTable columns={5} />
      ) : (
        <tbody>
          {events.map((event) => {
            const expanded = expandedEventId === event.id;
            const eventMatches = matches.filter((match) => match.event.id === event.id);
            const eventRankings = rankings.filter((ranking) => ranking.event.id === event.id);
            const eventSkills = skills.filter((skill) => skill.event.id === event.id);
            const eventAwards = awards.filter((award) => award.event.id === event.id);

            return (
              <Fragment key={event.id}>
                <tr className="team-event-row" onClick={() => setExpandedEventId(expanded ? null : event.id)}>
                  <td>
                    <button
                      className="event-group-name-btn"
                      onClick={(e) => { e.stopPropagation(); onViewMatches(event.id); }}
                    >
                      {event.name}
                    </button>
                    <div className="muted">{event.sku}</div>
                  </td>
                  <td>
                    <ProgramBadge program={event.program} />
                  </td>
                  <td>{locationLine(event)}</td>
                  <td>
                    <span className="date-range">{formatEventDateRange(event.start, event.end)}</span>
                  </td>
                  <td>
                    <span className={`event-priority priority-${eventCategory(event).rank}`}>{eventCategory(event).label}</span>
                  </td>
                </tr>
                {expanded && (
                  <tr className="team-event-detail-row">
                    <td colSpan={5}>
                      <TeamEventDetail
                        matches={eventMatches}
                        rankings={eventRankings}
                        skills={eventSkills}
                        awards={eventAwards}
                        focusTeamId={focusTeamId}
                        isIq={isIq}
                        loading={detailsLoading}
                        onViewMatches={() => onViewMatches(event.id)}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
          {!events.length && (
            <tr>
              <td colSpan={5}>
                <Empty />
              </td>
            </tr>
          )}
        </tbody>
      )}
    </table>
  );
}

function TeamEventDetail({
  matches,
  rankings,
  skills,
  awards,
  focusTeamId,
  isIq = false,
  loading,
  onViewMatches,
}: {
  matches: Match[];
  rankings: Ranking[];
  skills: Skill[];
  awards: Award[];
  focusTeamId: number;
  isIq?: boolean;
  loading: boolean;
  onViewMatches: () => void;
}) {
  const ranking = rankings[0];
  const skillsRow = skillSummary(skills);
  const iqFinals = isIq ? iqTeamFinals(matches, focusTeamId) : null;
  const iqStats = isIq ? iqTeamQualStats(matches, focusTeamId, ranking) : null;
  const iqFinalsMatches = isIq
    ? matches
        .filter((match) => isIqFinalsMatch(match) && match.alliances.some((alliance) => isTeamInAlliance(alliance, focusTeamId)))
        .sort((a, b) => (a.instance ?? 0) - (b.instance ?? 0) || a.matchnum - b.matchnum)
    : [];
  const elimMatches = isIq ? iqFinalsMatches : playoffMatchesForTeam(matches, focusTeamId);
  const elimAlliance = isIq ? null : inferElimAlliance(matches, focusTeamId);

  return (
    <div className="team-event-detail">
      {loading && !matches.length && !rankings.length && !skills.length && !awards.length && <div className="muted">Loading event details...</div>}
      <div className="team-event-summary-grid">
        <div className="team-event-awards">
          <div className="team-event-awards-head">
            <strong>Awards</strong>
            {!isIq && elimAlliance && (
              <span className="team-elim-seed">
                Seed {elimAlliance.seed}
                <span>{elimAlliance.teams.map((team) => team.name).join(" · ")}</span>
              </span>
            )}
            {isIq && iqFinals && iqFinals.seed && (
              <span className="team-elim-seed">
                {ordinal(iqFinals.seed)} seed
                <span>
                  {iqFinals.teams[0]?.name} (higher)
                  {iqFinals.teams[1] ? ` & ${iqFinals.teams[1].name}` : ""}
                </span>
              </span>
            )}
          </div>
          <div className="winner-row">
            {awards.length ? (
              sortAwards(awards).map((award) => (
                <span key={award.id} className="winner-pill">
                  {award.title.replace(/\s*\([^)]*\)\s*$/, "")}
                </span>
              ))
            ) : (
              <span className="muted">No awards</span>
            )}
          </div>
        </div>
        <div className="team-event-metrics">
          {isIq ? (
            <div className="metric-line">
              <strong>Ranking</strong>
              <span>
                <b>Rank</b> {ranking?.rank ?? "-"}
              </span>
              <span>
                <b>Avg</b> {formatNumber(iqStats?.avg)}
              </span>
              <span>
                <b>High</b> {iqStats?.high ?? "-"}
              </span>
              <span>
                <b>Low</b> {iqStats?.low ?? "-"}
              </span>
            </div>
          ) : (
            <div className="metric-line">
              <strong>Ranking</strong>
              <span>
                <b>Rank</b> {ranking?.rank ?? "-"}
              </span>
              <span>
                <b>Record</b> {ranking ? `${ranking.wins ?? 0}-${ranking.losses ?? 0}-${ranking.ties ?? 0}` : "-"}
              </span>
              <span>
                <b>WP</b> {ranking?.wp ?? "-"}
              </span>
              <span>
                <b>AP</b> {ranking?.ap ?? "-"}
              </span>
              <span>
                <b>SP</b> {ranking?.sp ?? "-"}
              </span>
            </div>
          )}
          <div className="metric-line">
            <strong>Skills</strong>
            <span>
              <b>Rank</b> {skillsRow.rank ?? "-"}
            </span>
            <span>
              Combined <b>{skillsRow.combined ?? "-"}</b>
            </span>
            <span>
              Driver <b>{skillsRow.driver?.score ?? "-"}</b> Attempts <b>{skillsRow.driver?.attempts ?? "-"}</b>
            </span>
            <span>
              Programming <b>{skillsRow.programming?.score ?? "-"}</b> Attempts <b>{skillsRow.programming?.attempts ?? "-"}</b>
            </span>
          </div>
        </div>
      </div>
      {elimMatches.length ? (
        <TeamEventMatchPreview matches={elimMatches.slice(0, 3)} focusTeamId={focusTeamId} onViewMatches={onViewMatches} isIq={isIq} />
      ) : (
        <div className="team-event-no-elims">
          <span className="muted">{isIq ? "No finals matches for this team at this event." : "No elimination matches for this team at this event."}</span>
          {matches.length > 0 && (
            <button type="button" className="view-all-matches" onClick={onViewMatches}>
              View all matches...
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function TeamEventMatchPreview({ matches, focusTeamId, onViewMatches, isIq = false }: { matches: Match[]; focusTeamId: number; onViewMatches: () => void; isIq?: boolean }) {
  const divisionWins = divisionFinalWins(matches, focusTeamId);
  const lastFinalIds = lastFinalIdsByDivision(matches);
  const elimAllianceNotice = isIq ? null : firstElimAllianceNotice(matches, focusTeamId);

  return (
    <table className="team-event-match-preview">
      <tbody>
        {matches.map((match) => {
          const { red, blue, redScore, blueScore, winner } = matchWinner(match);
          const iqResult = isIq ? iqMatchResult(match) : null;
          const outcome = isIq ? null : teamMatchOutcome(match, focusTeamId);
          const divisionWin = lastFinalIds.get(match.division.id) === match.id ? divisionWins.get(match.division.id) : undefined;
          const displayName = isIq && isIqFinalsMatch(match) ? "Finals" : match.name;
          return (
            <Fragment key={match.id}>
              {elimAllianceNotice?.matchId === match.id && (
                <tr className="elim-alliance-notice-row">
                  <td colSpan={4}>
                    <ElimAllianceNotice alliance={elimAllianceNotice.alliance} focusTeamId={focusTeamId} />
                  </td>
                </tr>
              )}
              <tr>
                <td className="truncate-cell">
                  <span className="team-match-name">
                    {outcome && <span className={`team-result-badge result-${outcome.toLowerCase()}`}>{outcome}</span>}
                    <span>{displayName}</span>
                  </span>
                </td>
                <td className={`red-alliance-cell ${!isIq && winner === "Red" ? "winning-alliance-cell" : ""} ${iqResult?.dqColor === "red" ? "dq-alliance-cell" : ""}`}>
                  <AllianceTeamLinks teams={red?.teams} focusTeamId={focusTeamId} dq={iqResult?.dqColor === "red"} />
                </td>
                <td className={`blue-alliance-cell ${!isIq && winner === "Blue" ? "winning-alliance-cell" : ""} ${iqResult?.dqColor === "blue" ? "dq-alliance-cell" : ""}`}>
                  <AllianceTeamLinks teams={blue?.teams} focusTeamId={focusTeamId} dq={iqResult?.dqColor === "blue"} />
                </td>
                {isIq ? (
                  <td className="score-cell">
                    <span className="score iq-score">{iqResult?.score ?? "-"}</span>
                  </td>
                ) : (
                  <td className="score-cell">
                    <span className={`score red ${winner === "Blue" ? "score-loser" : ""}`}>{redScore ?? "-"}</span>
                    <span className={`score blue ${winner === "Red" ? "score-loser" : ""}`}>{blueScore ?? "-"}</span>
                  </td>
                )}
              </tr>
              {!isIq && divisionWin && (
                <tr className="division-win-row">
                  <td colSpan={4}>{divisionWin.teamName} won {divisionWin.division.name} division!</td>
                </tr>
              )}
            </Fragment>
          );
        })}
        <tr>
          <td colSpan={4}>
            <button type="button" className="view-all-matches" onClick={onViewMatches}>
              View all matches...
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function TeamMatchesByEvent({
  matches,
  eventIndex,
  seasonId,
  focusTeamId,
  direction,
  focusedEventId,
  isIq = false,
  onViewMatches,
}: {
  matches: Match[];
  eventIndex: Map<number, Event>;
  seasonId: number | null;
  focusTeamId: number;
  direction: DateDirection;
  focusedEventId?: number | null;
  isIq?: boolean;
  onViewMatches?: (eventId: number) => void;
}) {
  const groups = groupItemsByEvent(matches, eventIndex, seasonId, direction);

  return (
    <Panel title="Matches" icon={<Gamepad2 />}>
      <div className="event-groups">
        {groups.map((group) => (
          <details key={group.eventRef.id} className="event-group" open={focusedEventId === group.eventRef.id}>
            <summary>
              <EventGroupTitle eventRef={group.eventRef} event={group.event} count={group.items.length} onViewMatches={onViewMatches} />
            </summary>
            <TeamMatchTable matches={group.items} focusTeamId={focusTeamId} isIq={isIq} />
          </details>
        ))}
        {!groups.length && <Empty>No matches returned for this season.</Empty>}
      </div>
    </Panel>
  );
}

function TeamMatchTable({ matches, focusTeamId, isIq = false }: { matches: Match[]; focusTeamId: number; isIq?: boolean }) {
  const sortedMatches = [...matches].sort((a, b) => compareMatchesDisplay(a, b, preferredTeamDivisionId(matches, focusTeamId)));
  const divisionWins = divisionFinalWins(sortedMatches, focusTeamId);
  const lastFinalIds = lastFinalIdsByDivision(sortedMatches);
  const elimAllianceNotice = isIq ? null : firstElimAllianceNotice(sortedMatches, focusTeamId);

  return (
    <table>
      <thead>
        <tr>
          <th>Match</th>
          <th>{isIq ? "Team" : "Red Alliance"}</th>
          <th>{isIq ? "Team" : "Blue Alliance"}</th>
          <th>Score</th>
        </tr>
      </thead>
      <tbody>
        {sortedMatches.map((match) => {
          const { red, blue, redScore, blueScore, winner } = matchWinner(match);
          const iqResult = isIq ? iqMatchResult(match) : null;
          const outcome = isIq ? null : teamMatchOutcome(match, focusTeamId);
          const divisionWin = lastFinalIds.get(match.division.id) === match.id ? divisionWins.get(match.division.id) : undefined;
          const displayName = isIq && isIqFinalsMatch(match) ? "Finals" : match.name;

          return (
            <Fragment key={match.id}>
              {elimAllianceNotice?.matchId === match.id && (
                <tr className="elim-alliance-notice-row">
                  <td colSpan={4}>
                    <ElimAllianceNotice alliance={elimAllianceNotice.alliance} focusTeamId={focusTeamId} />
                  </td>
                </tr>
              )}
              <tr>
                <td>
                  <span className="team-match-name">
                    {outcome && <span className={`team-result-badge result-${outcome.toLowerCase()}`}>{outcome}</span>}
                    <span>{displayName}</span>
                    {match.division?.name && <span className="muted inline-muted">{match.division.name}</span>}
                  </span>
                </td>
                <td className={`red-alliance-cell ${!isIq && winner === "Red" ? "winning-alliance-cell" : ""} ${iqResult?.dqColor === "red" ? "dq-alliance-cell" : ""}`}>
                  <AllianceTeamLinks teams={red?.teams} focusTeamId={focusTeamId} dq={iqResult?.dqColor === "red"} />
                </td>
                <td className={`blue-alliance-cell ${!isIq && winner === "Blue" ? "winning-alliance-cell" : ""} ${iqResult?.dqColor === "blue" ? "dq-alliance-cell" : ""}`}>
                  <AllianceTeamLinks teams={blue?.teams} focusTeamId={focusTeamId} dq={iqResult?.dqColor === "blue"} />
                </td>
                {isIq ? (
                  <td>
                    <span className="score iq-score">{iqResult?.score ?? "-"}</span>
                  </td>
                ) : (
                  <td>
                    <span className={`score red ${winner === "Blue" ? "score-loser" : ""}`}>{redScore ?? "-"}</span>
                    <span className={`score blue ${winner === "Red" ? "score-loser" : ""}`}>{blueScore ?? "-"}</span>
                  </td>
                )}
              </tr>
              {!isIq && divisionWin && (
                <tr className="division-win-row">
                  <td colSpan={4}>{divisionWin.teamName} won {divisionWin.division.name} division!</td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

function TeamRankingsByEvent({
  rankings,
  matches = [],
  eventIndex,
  seasonId,
  direction,
  focusTeamId,
  isIq = false,
  onViewMatches,
}: {
  rankings: Ranking[];
  matches?: Match[];
  eventIndex: Map<number, Event>;
  seasonId: number | null;
  direction: DateDirection;
  focusTeamId?: number;
  isIq?: boolean;
  onViewMatches?: (eventId: number) => void;
}) {
  const groups = groupItemsByEvent(rankings, eventIndex, seasonId, direction);
  const matchesByEvent = useMemo(() => {
    const map = new Map<number, Match[]>();
    matches.forEach((match) => {
      map.set(match.event.id, [...(map.get(match.event.id) ?? []), match]);
    });
    return map;
  }, [matches]);

  if (isIq) {
    return (
      <Panel title="Rankings" icon={<BarChart3 />}>
        <table>
          <thead>
            <tr>
              <th>Event</th>
              <th>Division</th>
              <th>Rank</th>
              <th>Avg</th>
              <th>High</th>
              <th>Low</th>
              <th>Dropped scores</th>
            </tr>
          </thead>
          <tbody>
            {groups.flatMap((group) =>
              group.items.map((row) => {
                const stats = iqTeamQualStats(matchesByEvent.get(group.eventRef.id) ?? [], focusTeamId ?? row.team.id, row);
                return (
                  <tr key={row.id}>
                    <td>
                      {onViewMatches ? (
                        <button className="event-group-name-btn" onClick={() => onViewMatches(group.eventRef.id)}>{group.eventRef.name}</button>
                      ) : (
                        <Link href={group.event ? eventPath(group.event) : `/event/${group.eventRef.code ?? group.eventRef.id}`}>{group.eventRef.name}</Link>
                      )}
                      <div className="muted">{group.event?.sku ?? group.eventRef.code}</div>
                    </td>
                    <td>{row.division?.name ?? "-"}</td>
                    <td>{row.rank}</td>
                    <td>{formatNumber(stats.avg)}</td>
                    <td>{stats.high ?? "-"}</td>
                    <td>{stats.low ?? "-"}</td>
                    <td>
                      <DroppedScores dropped={stats.dropped} />
                    </td>
                  </tr>
                );
              }),
            )}
            {!groups.length && (
              <tr>
                <td colSpan={7}>
                  <Empty>No rankings returned for this season.</Empty>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Panel>
    );
  }

  return (
    <Panel title="Rankings" icon={<BarChart3 />}>
      <table>
        <thead>
          <tr>
            <th>Event</th>
            <th>Division</th>
            <th>Rank</th>
            <th>Record</th>
            <th>WP</th>
            <th>AP</th>
            <th>SP</th>
            <th>Avg</th>
          </tr>
        </thead>
        <tbody>
          {groups.flatMap((group) =>
            group.items.map((row) => (
              <tr key={row.id}>
                <td>
                  {onViewMatches ? (
                    <button className="event-group-name-btn" onClick={() => onViewMatches(group.eventRef.id)}>{group.eventRef.name}</button>
                  ) : (
                    <Link href={group.event ? eventPath(group.event) : `/event/${group.eventRef.code ?? group.eventRef.id}`}>{group.eventRef.name}</Link>
                  )}
                  <div className="muted">{group.event?.sku ?? group.eventRef.code}</div>
                </td>
                <td>{row.division?.name ?? "-"}</td>
                <td>{row.rank}</td>
                <td>
                  {row.wins ?? 0}-{row.losses ?? 0}-{row.ties ?? 0}
                </td>
                <td>{row.wp ?? "-"}</td>
                <td>{row.ap ?? "-"}</td>
                <td>{row.sp ?? "-"}</td>
                <td>{formatNumber(row.average_points)}</td>
              </tr>
            )),
          )}
          {!groups.length && (
            <tr>
              <td colSpan={8}>
                <Empty>No rankings returned for this season.</Empty>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Panel>
  );
}

function TeamSkillsByEvent({
  skills,
  eventIndex,
  seasonId,
  direction,
  onViewMatches,
}: {
  skills: Skill[];
  eventIndex: Map<number, Event>;
  seasonId: number | null;
  direction: DateDirection;
  onViewMatches?: (eventId: number) => void;
}) {
  const groups = groupItemsByEvent(skills, eventIndex, seasonId, direction).map((group) => {
    const entries = [...group.items].sort((a, b) => (a.type === "driver" ? -1 : 1) - (b.type === "driver" ? -1 : 1));
    const bestByType = new Map<string, Skill>();

    entries.forEach((skill) => {
      const key = skill.type.toLowerCase();
      const existing = bestByType.get(key);
      if (!existing || (skill.score ?? -1) > (existing.score ?? -1)) bestByType.set(key, skill);
    });

    return { ...group, entries: [...bestByType.values()] };
  });

  return (
    <Panel title="Skills" icon={<Activity />}>
      <table className="skills-table team-skills-table">
        <thead>
          <tr>
            <th>Event</th>
            <th>Rank</th>
            <th>Total</th>
            <th>Driver</th>
            <th>Programming</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => {
            const entries = group.entries.sort((a, b) => a.type.localeCompare(b.type));
            const { driver, programming } = bestSkillEntries(entries);
            const rank = entries.reduce<number | null>((best, entry) => {
              if (entry.rank === null || entry.rank === undefined) return best;
              return best === null ? entry.rank : Math.min(best, entry.rank);
            }, null);
            const total = entries.reduce((sum, entry) => sum + (entry.score ?? 0), 0);

            return (
              <tr key={group.eventRef.id}>
                <td>
                  {onViewMatches ? (
                    <button className="event-group-name-btn" onClick={() => onViewMatches(group.eventRef.id)}>{group.eventRef.name}</button>
                  ) : (
                    <Link href={group.event ? eventPath(group.event) : `/event/${group.eventRef.code ?? group.eventRef.id}`}>{group.eventRef.name}</Link>
                  )}
                  <div className="muted">{group.event?.sku ?? group.eventRef.code}</div>
                </td>
                <td>{rank ?? "-"}</td>
                <td>{total || "-"}</td>
                <td>
                  <SkillScoreAttempt label="Driver" entry={driver} />
                </td>
                <td>
                  <SkillScoreAttempt label="Programming" entry={programming} />
                </td>
              </tr>
            );
          })}
          {!groups.length && (
            <tr>
              <td colSpan={5}>
                <Empty>No skills scores returned for this season.</Empty>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Panel>
  );
}

function TeamAwardsByEvent({
  awards,
  eventIndex,
  seasonId,
  focusTeamId,
  direction,
  onViewMatches,
}: {
  awards: Award[];
  eventIndex: Map<number, Event>;
  seasonId: number | null;
  focusTeamId: number;
  direction: DateDirection;
  onViewMatches?: (eventId: number) => void;
}) {
  const groups = groupItemsByEvent(awards, eventIndex, seasonId, direction);
  const programCode = useContext(ProgramContext);

  return (
    <Panel title="Awards" icon={<Medal />}>
      <div className="event-groups">
        {groups.map((group) => (
          <details key={group.eventRef.id} className="event-group" open>
            <summary>
              <EventGroupTitle eventRef={group.eventRef} event={group.event} count={group.items.length} onViewMatches={onViewMatches} />
            </summary>
            <div className="award-list">
              {sortAwards(group.items).map((award) => (
                <article className="award-item" key={award.id}>
                  <h3>{award.title}</h3>
                  <div className="winner-row">
                    {awardTeamWinners(award).map((winner) => (
                      <Link
                        key={`${award.id}-${winner.team.id}`}
                        href={teamSlugPath(programCode, winner.team.name, winner.team.id)}
                        className={`winner-pill ${winner.team.id === focusTeamId ? "" : "other"}`}
                      >
                        {winner.team.name}
                      </Link>
                    ))}
                    {awardIndividualWinners(award).map((winner) => (
                      <span key={winner} className="winner-pill">
                        {winner}
                      </span>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </details>
        ))}
        {!groups.length && <Empty>No awards returned for this season.</Empty>}
      </div>
    </Panel>
  );
}

function EventHighlights({ awards }: { awards: HighlightAward[] }) {
  return (
    <div className="event-highlights">
      {awards.map((highlight) => {
        const Icon = highlight.kind === "skills" ? Medal : highlight.kind === "champions" ? Trophy : Star;
        return (
          <article key={`${highlight.kind}-${highlight.award.id}`} className={`event-highlight-card highlight-${highlight.kind}`}>
            <div className="event-highlight-icon">
              <Icon size={15} />
            </div>
            <div className="event-highlight-body">
              <strong>{highlight.label}</strong>
              <div>
                {awardTeamWinners(highlight.award).map((winner) => (
                  <TeamMiniLink key={`${highlight.award.id}-${winner.team.id}`} team={winner.team} />
                ))}
                {awardIndividualWinners(highlight.award).map((winner) => (
                  <span key={winner}>{winner}</span>
                ))}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: Array<[string, string, ReactNode, (() => void)?]>;
  active: string;
  onChange: (tab: string) => void;
}) {
  return (
    <div className="tabs">
      {tabs.map(([id, label, icon, onClose]) => (
        <button key={id} className={active === id ? "active" : ""} onClick={() => onChange(id)}>
          {icon}
          {label}
          {onClose && (
            <span
              className="tab-close-btn"
              role="button"
              aria-label={`Close ${label} tab`}
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
            >
              ×
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

function MatchesTable({
  matches,
  timestampMap,
  presetSupported,
  presetLoading,
  presetUrl,
  onOpenMatch,
  isIq = false,
}: {
  matches: Match[];
  timestampMap: Map<number, MatchTimestamp>;
  presetSupported: boolean;
  presetLoading: boolean;
  presetUrl: string | null;
  onOpenMatch: (match: Match, timestamp: MatchTimestamp) => void;
  isIq?: boolean;
}) {
  const [qualificationDirection, setQualificationDirection] = useState<DateDirection>("asc");
  const [bracketOpen, setBracketOpen] = useState(false);
  const qualificationMatches = matches
    .filter((match) => match.round === 2)
    .sort((a, b) => (qualificationDirection === "asc" ? 1 : -1) * (a.matchnum - b.matchnum));
  const playoffMatches = matches.filter((match) => playoffImportance(match) > 0).sort(compareMatchesDisplay);
  const playoffGroups = playoffMatches.reduce<Map<string, Match[]>>((groups, match) => {
    const key = playoffRoundKey(match);
    groups.set(key, [...(groups.get(key) ?? []), match]);
    return groups;
  }, new Map());
  const allianceRows = allianceRowsFromMatches(matches);
  const playoffOrder = ["r16", "qf", "sf", "f"];
  // Final-division events (two divisions facing off) have no qualification
  // matches, only the cross-division finals. In that case promote the
  // elimination matches into the main (left) column.
  const noQuals = !isIq && qualificationMatches.length === 0 && playoffMatches.length > 0;
  const renderElimGroups = () =>
    playoffOrder
      .filter((key) => playoffGroups.has(key))
      .map((key) => (
        <section className="playoff-round" key={key}>
          <h3>{playoffRoundLabel(key)}</h3>
          <ResultsMatchTable
            matches={(playoffGroups.get(key) ?? []).sort(compareMatchesDisplay)}
            emptyText="No playoff matches returned."
            timestampMap={timestampMap}
            presetSupported={presetSupported}
            presetLoading={presetLoading}
            presetUrl={presetUrl}
            onOpenMatch={onOpenMatch}
            dayNumbers={dayNumbers}
          />
        </section>
      ));

  const dayKeys = [...new Set(matches.map(matchDayKey).filter((key): key is string => !!key))].sort();
  const dayNumbers = dayKeys.length > 1 ? new Map(dayKeys.map((key, index) => [key, index + 1] as const)) : undefined;

  // IQ Teamwork: cooperative format. Finals are round 15; "alliances" are the
  // finals partner pairs seeded by score; there is no elimination bracket.
  const iqFinals = isIq
    ? matches.filter((match) => isIqFinalsMatch(match)).sort(compareMatchesDisplay)
    : [];
  const iqFinalsLabelMap = isIq ? iqFinalsLabels(matches) : undefined;
  const iqAllianceRows = isIq ? iqFinalsAlliances(matches) : [];

  return (
    <div className="results-layout">
      <section className="results-column">
        <h2>{noQuals ? "Elimination Results" : "Qualification Results"}</h2>
        {noQuals ? (
          renderElimGroups()
        ) : (
          <ResultsMatchTable
            matches={qualificationMatches}
            emptyText="No qualification matches returned."
            matchDirection={qualificationDirection}
            onToggleMatchDirection={() => setQualificationDirection((direction) => (direction === "asc" ? "desc" : "asc"))}
            timestampMap={timestampMap}
            presetSupported={presetSupported}
            presetLoading={presetLoading}
            presetUrl={presetUrl}
            onOpenMatch={onOpenMatch}
            dayNumbers={dayNumbers}
            isIq={isIq}
          />
        )}
      </section>
      <section className="results-column">
        <div className="alliances-header">
          <h2>Alliances</h2>
          {!isIq && playoffMatches.length > 0 && (
            <button className="bracket-open-btn" onClick={() => setBracketOpen(true)}>
              See elimination bracket
            </button>
          )}
        </div>
        <AllianceSelectionTable alliances={isIq ? iqAllianceRows : allianceRows} iq={isIq} />
        {isIq ? (
          <>
            <h2>Finals matches</h2>
            <ResultsMatchTable
              matches={iqFinals}
              emptyText="No finals matches returned."
              timestampMap={timestampMap}
              presetSupported={presetSupported}
              presetLoading={presetLoading}
              presetUrl={presetUrl}
              onOpenMatch={onOpenMatch}
              dayNumbers={dayNumbers}
              isIq
              labelFor={(match) => iqFinalsLabelMap?.get(match.id)}
            />
          </>
        ) : (
          !noQuals && (
            <>
              <h2>Elimination Results</h2>
              {renderElimGroups()}
              {!playoffMatches.length && <Empty>No playoff matches returned.</Empty>}
            </>
          )
        )}
      </section>
      {!isIq && bracketOpen && <EliminationBracketOverlay matches={playoffMatches} onClose={() => setBracketOpen(false)} />}
    </div>
  );
}

function ResultsMatchTable({
  matches,
  emptyText,
  matchDirection,
  onToggleMatchDirection,
  timestampMap,
  presetSupported,
  presetLoading,
  presetUrl,
  onOpenMatch,
  dayNumbers,
  isIq = false,
  labelFor,
}: {
  matches: Match[];
  emptyText: string;
  matchDirection?: DateDirection;
  onToggleMatchDirection?: () => void;
  timestampMap?: Map<number, MatchTimestamp>;
  presetSupported?: boolean;
  presetLoading?: boolean;
  presetUrl?: string | null;
  onOpenMatch?: (match: Match, timestamp: MatchTimestamp) => void;
  dayNumbers?: Map<string, number>;
  isIq?: boolean;
  labelFor?: (match: Match) => string | undefined;
}) {
  return (
    <table className="results-match-table">
      <colgroup>
        <col className="results-play-col" />
        <col className="results-match-col" />
        <col className="results-alliance-col" />
        <col className="results-alliance-col" />
        <col className="results-score-col" />
      </colgroup>
      <thead>
        <tr>
          <th className="play-cell" aria-label="Open match">
            {presetLoading ? (
              <span className="play-header-icon loading" />
            ) : presetSupported ? (
              <a href={presetUrl ?? "#"} target="_blank" rel="noopener noreferrer" className="play-header-link active" title="Open in Jumper">
                <LinkIcon size={14} />
              </a>
            ) : (
              <span className="play-header-link disabled" title="No livestream preset">
                <Unlink size={14} />
              </span>
            )}
          </th>
          <th>
            <span className="match-header-label">
              Match
              {onToggleMatchDirection && (
                <button className="match-sort-toggle" onClick={onToggleMatchDirection} aria-label="Toggle match order">
                  {matchDirection === "desc" ? "▾" : "▴"}
                </button>
              )}
            </span>
          </th>
          <th>{isIq ? "Team" : "Red Alliance"}</th>
          <th>{isIq ? "Team" : "Blue Alliance"}</th>
          <th>Score</th>
        </tr>
      </thead>
      <tbody>
        {matches.map((match, index) => {
          const { red, blue, redScore, blueScore, winner } = matchWinner(match);
          const redTeams = red?.teams ?? [];
          const blueTeams = blue?.teams ?? [];
          const iqResult = isIq ? iqMatchResult(match) : null;
          const timestamp = timestampMap?.get(match.id);
          const matchClock = formatMatchClock(match);
          const canPlay = presetSupported && timestamp && timestamp.timestamp !== null && timestamp.videoId;
          const displayName = labelFor?.(match) ?? match.name;

          let dayDivider: ReactNode = null;
          if (dayNumbers && index > 0) {
            const dayKey = matchDayKey(match);
            const prevDayKey = matchDayKey(matches[index - 1]);
            if (dayKey && prevDayKey && dayKey !== prevDayKey) {
              const currentDay = dayNumbers.get(dayKey);
              const prevDay = dayNumbers.get(prevDayKey);
              if (currentDay && prevDay) {
                dayDivider = (
                  <tr className="match-day-divider-row">
                    <td colSpan={5}>End of Day {Math.min(currentDay, prevDay)}</td>
                  </tr>
                );
              }
            }
          }

          return (
            <Fragment key={match.id}>
              {dayDivider}
              <tr>
              <td className="play-cell">
                {canPlay ? (
                  <button
                    className="play-dot active"
                    onClick={() => onOpenMatch?.(match, timestamp)}
                    title={`Play ${displayName}`}
                  />
                ) : (
                  <span className="play-dot disabled" />
                )}
              </td>
              <td className="result-match-name">
                <span className="result-match-line">
                  <span className="result-match-label">{displayName}</span>
                  {matchClock && <span className="result-match-time">{matchClock}</span>}
                  {match.field && (
                    <span className="result-field-name">
                      {match.field}
                    </span>
                  )}
                </span>
              </td>
              <td className={`alliance-cell red-alliance-cell ${!isIq && winner === "Red" ? "winning-alliance-cell" : ""} ${iqResult?.dqColor === "red" ? "dq-alliance-cell" : ""}`}>
                <AllianceTeamLinks teams={redTeams} dq={iqResult?.dqColor === "red"} />
              </td>
              <td className={`alliance-cell blue-alliance-cell ${!isIq && winner === "Blue" ? "winning-alliance-cell" : ""} ${iqResult?.dqColor === "blue" ? "dq-alliance-cell" : ""}`}>
                <AllianceTeamLinks teams={blueTeams} dq={iqResult?.dqColor === "blue"} />
              </td>
              {isIq ? (
                <td className="score-cell">
                  <span className="score iq-score">{iqResult?.score ?? "-"}</span>
                </td>
              ) : (
                <td className="score-cell">
                  <span className={`score red ${winner === "Blue" ? "score-loser" : ""}`}>{redScore ?? "-"}</span>
                  <span className={`score blue ${winner === "Red" ? "score-loser" : ""}`}>{blueScore ?? "-"}</span>
                </td>
              )}
              </tr>
            </Fragment>
          );
        })}
        {!matches.length && (
          <tr>
            <td colSpan={5}>
              <Empty>{emptyText}</Empty>
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

function formatTimestamp(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

function MatchVideoOverlay({ playback, onClose }: { playback: MatchPlayback; onClose: () => void }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const playerRef = useRef<{ seekTo: (s: number, b: boolean) => void; pauseVideo: () => void; playVideo: () => void; getCurrentTime: () => number; destroy: () => void } | null>(null);
  const pollRef = useRef<number>(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(playback.timestamp.timestamp ?? 0);

  const { red, blue, redScore, blueScore, winner } = matchWinner(playback.match);
  const redTeams = red?.teams.map((t) => t.team.name).join(" ") ?? "";
  const blueTeams = blue?.teams.map((t) => t.team.name).join(" ") ?? "";
  const startSeconds = Math.max(0, Math.floor(playback.timestamp.timestamp ?? 0));

  const embedUrl = useMemo(() => {
    if (!playback.timestamp.videoId) return "";
    const params = new URLSearchParams({
      enablejsapi: "1",
      autoplay: "1",
      start: String(startSeconds),
      rel: "0",
      modestbranding: "1",
      origin: window.location.origin,
    });
    return `https://www.youtube.com/embed/${playback.timestamp.videoId}?${params.toString()}`;
  }, [playback.timestamp.videoId, startSeconds]);

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!playback.timestamp.videoId || !iframeRef.current) return;
    let destroyed = false;

    onYtApiReady(() => {
      if (destroyed || !iframeRef.current) return;
      const YT = (window as unknown as Record<string, unknown>).YT as { Player: new (el: HTMLElement, opts: unknown) => unknown };
      const player = new YT.Player(iframeRef.current, {
        events: {
          onReady: () => {
            playerRef.current = player as typeof playerRef.current;
          },
          onStateChange: (event: { data: number }) => {
            setIsPlaying(event.data === 1);
            if ((event.data === 1 || event.data === 3) && !pollRef.current) {
              pollRef.current = window.setInterval(() => {
                const t = playerRef.current?.getCurrentTime() ?? 0;
                if (t > 0) setCurrentTime(Math.floor(t));
              }, 1000);
            }
          },
        },
      }) as typeof playerRef.current;
    });

    return () => {
      destroyed = true;
      window.clearInterval(pollRef.current);
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [playback.timestamp.videoId]);

  const seekBy = (delta: number) => {
    if (!playerRef.current) return;
    const newTime = Math.max(0, playerRef.current.getCurrentTime() + delta);
    playerRef.current.seekTo(newTime, true);
    setCurrentTime(Math.floor(newTime));
  };

  const togglePlay = () => {
    if (!playerRef.current) return;
    if (isPlaying) {
      playerRef.current.pauseVideo();
    } else {
      playerRef.current.playVideo();
    }
  };

  return (
    <div className="video-overlay" onClick={onClose}>
      <div className="video-modal" onClick={(e) => e.stopPropagation()}>
        <div className="video-modal-header">
          <div className="video-match-info">
            <strong>{playback.match.name}</strong>
            <span className="video-match-teams">
              <span className={`video-team-red ${winner === "Red" ? "winning" : ""}`}>{redTeams}</span>
              <span className="video-vs">vs</span>
              <span className={`video-team-blue ${winner === "Blue" ? "winning" : ""}`}>{blueTeams}</span>
            </span>
            {redScore !== null && blueScore !== null && (
              <span className="video-match-score">
                <span className={`score red ${winner === "Blue" ? "score-loser" : ""}`}>{redScore}</span>
                <span className={`score blue ${winner === "Red" ? "score-loser" : ""}`}>{blueScore}</span>
              </span>
            )}
          </div>
          <div className="video-header-actions">
            <a
              href={playback.timestamp.livestreamLink ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="video-yt-link"
            >
              <Youtube size={16} />
              Open in YouTube
            </a>
            <button className="video-close-btn" onClick={onClose} aria-label="Close">&times;</button>
          </div>
        </div>
        <div className="video-embed-wrap">
          {playback.timestamp.videoId ? (
            <iframe
              ref={iframeRef}
              src={embedUrl}
              className="video-player-iframe"
              allow="autoplay; encrypted-media; fullscreen"
              allowFullScreen
            />
          ) : (
            <div className="video-unavailable">Video unavailable</div>
          )}
        </div>
        <div className="video-controls">
          <button onClick={() => seekBy(-60)} title="Back 1 minute">-1m</button>
          <button onClick={() => seekBy(-30)} title="Back 30 seconds">-30s</button>
          <button onClick={() => seekBy(-10)} title="Back 10 seconds">-10s</button>
          <button onClick={() => seekBy(-5)} title="Back 5 seconds">-5s</button>
          <button className="video-play-btn" onClick={togglePlay} title={isPlaying ? "Pause" : "Play"}>
            {isPlaying ? <Pause size={18} /> : <Play size={18} />}
          </button>
          <button onClick={() => seekBy(5)} title="Forward 5 seconds">+5s</button>
          <button onClick={() => seekBy(10)} title="Forward 10 seconds">+10s</button>
          <button onClick={() => seekBy(30)} title="Forward 30 seconds">+30s</button>
          <button onClick={() => seekBy(60)} title="Forward 1 minute">+1m</button>
        </div>
        <div className="video-timestamp">
          {formatTimestamp(currentTime)} from stream start
        </div>
      </div>
    </div>
  );
}

type BracketTeam = { id: number; name: string };
type BracketSlot = { seed: number | null; teams: BracketTeam[]; score: number | null; winner: boolean };
type BracketNode = { id: string; label: string; red: BracketSlot; blue: BracketSlot };
type BracketRound = { key: string; nodes: BracketNode[] };

function allianceTeamKey(teams: BracketTeam[]) {
  return teams
    .map((team) => team.name?.toLowerCase().trim())
    .filter(Boolean)
    .sort()
    .join("|");
}

function buildBracketSeedMap(matches: Match[]) {
  const seedMap = new Map<string, number>();
  const assignFromRound = (key: "r16" | "qf", pairs: number[][]) => {
    matches
      .filter((match) => playoffRoundKey(match) === key)
      .forEach((match) => {
        const pair = pairs[(match.instance ?? 1) - 1];
        if (!pair) return;
        const red = match.alliances.find((alliance) => alliance.color === "red");
        const blue = match.alliances.find((alliance) => alliance.color === "blue");
        if (red) {
          const key = allianceTeamKey(red.teams.map((entry) => entry.team));
          if (key && !seedMap.has(key)) seedMap.set(key, pair[0]);
        }
        if (blue) {
          const key = allianceTeamKey(blue.teams.map((entry) => entry.team));
          if (key && !seedMap.has(key)) seedMap.set(key, pair[1]);
        }
      });
  };
  assignFromRound("r16", r16SeedPairs);
  assignFromRound("qf", qfSeedPairs);
  return seedMap;
}

function seedForTeams(seedMap: Map<string, number>, teams: BracketTeam[]) {
  const key = allianceTeamKey(teams);
  return key && seedMap.has(key) ? seedMap.get(key) ?? null : null;
}

const bracketRoundShort: Record<string, string> = { r16: "R16", qf: "QF", sf: "SF", f: "Finals" };

function buildBracketSlotNode(slotMatches: Match[], seedMap: Map<string, number>, label: string, id: string): BracketNode {
  const ordered = [...slotMatches].sort((a, b) => (a.instance ?? 0) - (b.instance ?? 0) || a.matchnum - b.matchnum);
  const sample = ordered[ordered.length - 1];
  const redTeams = sample.alliances.find((alliance) => alliance.color === "red")?.teams.map((entry) => entry.team) ?? [];
  const blueTeams = sample.alliances.find((alliance) => alliance.color === "blue")?.teams.map((entry) => entry.team) ?? [];

  if (ordered.length === 1) {
    const { winner, redScore, blueScore } = matchWinner(sample);
    return {
      id,
      label,
      red: { seed: seedForTeams(seedMap, redTeams), teams: redTeams, score: redScore ?? null, winner: winner === "Red" },
      blue: { seed: seedForTeams(seedMap, blueTeams), teams: blueTeams, score: blueScore ?? null, winner: winner === "Blue" },
    };
  }

  let redWins = 0;
  let blueWins = 0;
  ordered.forEach((match) => {
    const { winner } = matchWinner(match);
    if (winner === "Red") redWins += 1;
    else if (winner === "Blue") blueWins += 1;
  });
  return {
    id,
    label,
    red: { seed: seedForTeams(seedMap, redTeams), teams: redTeams, score: redWins, winner: redWins > blueWins },
    blue: { seed: seedForTeams(seedMap, blueTeams), teams: blueTeams, score: blueWins, winner: blueWins > redWins },
  };
}

function buildBracketRounds(matches: Match[]): BracketRound[] {
  const seedMap = buildBracketSeedMap(matches);
  const rounds: BracketRound[] = [];

  (["r16", "qf", "sf", "f"] as const).forEach((key) => {
    const roundMatches = matches.filter((match) => playoffRoundKey(match) === key);
    if (!roundMatches.length) return;

    const byInstance = new Map<number, Match[]>();
    roundMatches.forEach((match) => {
      const instance = match.instance ?? 1;
      byInstance.set(instance, [...(byInstance.get(instance) ?? []), match]);
    });

    const nodes = [...byInstance.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([instance, slotMatches]) =>
        buildBracketSlotNode(
          slotMatches,
          seedMap,
          key === "f" ? (slotMatches.length > 1 ? `Finals (Bo${slotMatches.length})` : "Finals") : `${bracketRoundShort[key]} #${instance}`,
          `${key}-${instance}`,
        ),
      );

    rounds.push({ key, nodes });
  });

  return rounds;
}

function BracketSlotRow({ slot, color }: { slot: BracketSlot; color: "red" | "blue" }) {
  return (
    <div className={`bracket-slot bracket-slot-${color} ${slot.winner ? "bracket-slot-winner" : ""}`}>
      <span className="bracket-seed">{slot.seed ?? ""}</span>
      <span className="bracket-teams">
        {slot.teams.length ? (
          slot.teams.map((team) => <TeamMiniLink key={team.id} team={team} />)
        ) : (
          <span className="bracket-tbd">—</span>
        )}
      </span>
      <span className="bracket-score">{slot.score ?? ""}</span>
    </div>
  );
}

function BracketConnectors({ count }: { count: number }) {
  return (
    <div className="bracket-connector">
      {Array.from({ length: count }).map((_, index) => (
        <div className="bracket-connector-cell" key={index}>
          <span className="conn-top" />
          <span className="conn-bottom" />
          <span className="conn-vert" />
          <span className="conn-out" />
        </div>
      ))}
    </div>
  );
}

function EliminationBracket({ matches }: { matches: Match[] }) {
  const rounds = useMemo(() => buildBracketRounds(matches), [matches]);
  if (!rounds.length) return <Empty>No elimination matches returned.</Empty>;

  return (
    <div className="bracket">
      {rounds.map((round, roundIndex) => (
        <Fragment key={round.key}>
          <div className="bracket-round">
            {round.nodes.map((node) => (
              <div className="bracket-match" key={node.id}>
                <div className="bracket-box">
                  <div className="bracket-box-label">{node.label}</div>
                  <div className="bracket-box-slots">
                    <BracketSlotRow slot={node.red} color="red" />
                    <BracketSlotRow slot={node.blue} color="blue" />
                  </div>
                </div>
              </div>
            ))}
          </div>
          {roundIndex < rounds.length - 1 && <BracketConnectors count={Math.ceil(round.nodes.length / 2)} />}
        </Fragment>
      ))}
    </div>
  );
}

function EliminationBracketOverlay({ matches, onClose }: { matches: Match[]; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="video-overlay bracket-overlay" onClick={onClose}>
      <div className="bracket-modal" onClick={(event) => event.stopPropagation()}>
        <div className="bracket-modal-header">
          <strong>Elimination Bracket</strong>
          <button className="video-close-btn" onClick={onClose} aria-label="Close">&times;</button>
        </div>
        <div className="bracket-modal-body">
          <EliminationBracket matches={matches} />
        </div>
      </div>
    </div>
  );
}

function AllianceSelectionTable({ alliances, iq = false }: { alliances: Array<[number, string[]]>; iq?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  if (!alliances.length) return <Empty>{iq ? "No finals alliances returned." : "No alliance selections returned."}</Empty>;

  const collapsible = alliances.length > 2;
  const showFade = collapsible && !expanded;
  const visibleAlliances = showFade ? alliances.slice(0, 3) : alliances;

  return (
    <div className={`alliance-collapse ${showFade ? "is-collapsed" : ""}`}>
      <table className="alliance-selection-table">
        <thead>
          <tr>
            <th>Seed</th>
            <th>{iq ? "Team" : "Captain"}</th>
            <th>{iq ? "Team" : "Pick 1"}</th>
          </tr>
        </thead>
        <tbody>
          {visibleAlliances.map(([seed, teams], rowIndex) => (
            <tr
              key={`${seed}-${teams.join("-")}`}
              className={showFade && rowIndex === 2 ? "alliance-row-fade" : ""}
            >
              <td>Seed {seed}</td>
              {Array.from({ length: 2 }).map((_, teamIndex) => (
                <td key={teamIndex}>{teams[teamIndex] ?? ""}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {showFade && (
        <button className="alliance-show-all" onClick={() => setExpanded(true)}>
          Show all seeds
          <ChevronDown size={15} />
        </button>
      )}
      {collapsible && expanded && (
        <button className="alliance-show-all alliance-show-less" onClick={() => setExpanded(false)} aria-label="Show fewer seeds">
          <ChevronUp size={18} />
        </button>
      )}
    </div>
  );
}

function DroppedScores({ dropped }: { dropped: Array<{ matchnum: number; score: number }> }) {
  if (!dropped.length) return <span className="muted">-</span>;
  return (
    <span className="dropped-scores">
      {dropped.map((entry, index) => (
        <span key={entry.matchnum} className="dropped-score-item">
          Q{entry.matchnum} ({entry.score}){index < dropped.length - 1 ? "," : ""}
        </span>
      ))}
    </span>
  );
}

function RankingsTable({ rankings, isIq = false, matches = [] }: { rankings: Ranking[]; isIq?: boolean; matches?: Match[] }) {
  const sortedRankings = [...rankings].sort((a, b) => a.rank - b.rank);
  const programCode = useContext(ProgramContext);

  if (isIq) {
    return (
      <Panel title="Rankings" icon={<BarChart3 />}>
        <table>
          <thead>
            <tr>
              <th>Rank</th>
              <th>Team</th>
              <th>Avg</th>
              <th>High</th>
              <th>Low</th>
              <th>Dropped scores</th>
            </tr>
          </thead>
          <tbody>
            {sortedRankings.map((row) => {
              const stats = iqTeamQualStats(matches, row.team.id, row);
              return (
                <tr key={row.id}>
                  <td>{row.rank}</td>
                  <td className="team-cell">
                    <Link href={teamSlugPath(programCode, row.team.name, row.team.id)}>{row.team.name}</Link>
                  </td>
                  <td>{formatNumber(stats.avg)}</td>
                  <td>{stats.high ?? "-"}</td>
                  <td>{stats.low ?? "-"}</td>
                  <td>
                    <DroppedScores dropped={stats.dropped} />
                  </td>
                </tr>
              );
            })}
            {!sortedRankings.length && (
              <tr>
                <td colSpan={6}>
                  <Empty>No rankings returned.</Empty>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Panel>
    );
  }

  return (
    <Panel title="Rankings" icon={<BarChart3 />}>
      <table>
        <thead>
          <tr>
            <th>Rank</th>
            <th>Team</th>
            <th>Record</th>
            <th>WP</th>
            <th>AP</th>
            <th>SP</th>
            <th>High</th>
            <th>Avg</th>
          </tr>
        </thead>
        <tbody>
          {sortedRankings.map((row) => (
            <tr key={row.id}>
              <td>{row.rank}</td>
              <td className="team-cell">
                <Link href={teamSlugPath(programCode, row.team.name, row.team.id)}>{row.team.name}</Link>
              </td>
              <td>
                {row.wins ?? 0}-{row.losses ?? 0}-{row.ties ?? 0}
              </td>
              <td>{row.wp ?? "-"}</td>
              <td>{row.ap ?? "-"}</td>
              <td>{row.sp ?? "-"}</td>
              <td>{row.high_score ?? "-"}</td>
              <td>{formatNumber(row.average_points)}</td>
            </tr>
          ))}
          {!sortedRankings.length && (
            <tr>
              <td colSpan={8}>
                <Empty>No rankings returned.</Empty>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Panel>
  );
}

function SkillsTable({ skills }: { skills: Skill[] }) {
  const programCode = useContext(ProgramContext);
  const rows = Object.values(
    skills.reduce<Record<string, { rank: number | null; team: Skill["team"]; entries: Skill[] }>>((groups, skill) => {
      const key = String(skill.team.id ?? skill.team.name);
      const existing = groups[key];

      if (!existing) {
        groups[key] = { rank: skill.rank ?? null, team: skill.team, entries: [skill] };
        return groups;
      }

      existing.rank =
        existing.rank === null
          ? skill.rank ?? null
          : skill.rank === null || skill.rank === undefined
            ? existing.rank
            : Math.min(existing.rank, skill.rank);

      const sameTypeIndex = existing.entries.findIndex((entry) => entry.type.toLowerCase() === skill.type.toLowerCase());
      if (sameTypeIndex >= 0) {
        const previous = existing.entries[sameTypeIndex];
        existing.entries[sameTypeIndex] = (skill.score ?? -1) > (previous.score ?? -1) ? skill : previous;
      } else {
        existing.entries.push(skill);
      }

      return groups;
    }, {}),
  ).sort((a, b) => (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER) || a.team.name.localeCompare(b.team.name));

  return (
    <Panel title="Skills" icon={<Activity />}>
      <table className="skills-table">
        <thead>
          <tr>
            <th>Rank</th>
            <th>Team</th>
            <th>Total</th>
            <th>Driver</th>
            <th>Programming</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const entries = [...row.entries].sort((a, b) => a.type.localeCompare(b.type));
            const { driver, programming } = bestSkillEntries(entries);
            const total = entries.reduce((sum, entry) => sum + (entry.score ?? 0), 0);

            return (
              <tr key={row.team.id}>
                <td>{row.rank ?? "-"}</td>
                <td>
                  <Link href={teamSlugPath(programCode, row.team.name, row.team.id)}>{row.team.name}</Link>
                </td>
                <td>{total || "-"}</td>
                <td>
                  <SkillScoreAttempt label="Driver" entry={driver} />
                </td>
                <td>
                  <SkillScoreAttempt label="Programming" entry={programming} />
                </td>
              </tr>
            );
          })}
          {!rows.length && (
            <tr>
              <td colSpan={5}>
                <Empty>No skills scores returned.</Empty>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Panel>
  );
}

function AwardsList({ awards }: { awards: Award[] }) {
  const sortedAwards = sortAwards(awards);
  const programCode = useContext(ProgramContext);

  return (
    <Panel title="Awards" icon={<Medal />}>
      <div className="award-list">
        {sortedAwards.map((award) => (
          <article className="award-item" key={award.id}>
            <h3>{award.title}</h3>
            <div className="winner-row">
              {awardTeamWinners(award).map((winner) => (
                <Link key={`${award.id}-${winner.team.id}`} href={teamSlugPath(programCode, winner.team.name, winner.team.id)} className="winner-pill">
                  {winner.team.name}
                </Link>
              ))}
              {awardIndividualWinners(award).map((winner) => (
                <span key={winner} className="winner-pill">
                  {winner}
                </span>
              ))}
            </div>
          </article>
        ))}
        {!sortedAwards.length && <Empty>No awards returned.</Empty>}
      </div>
    </Panel>
  );
}

function InsightsPage() {
  const [program, setProgram] = useState<"v5rc" | "viqrc">("v5rc");
  const { data, loading, error } = useAsync(() => api.superscore(program, { per_page: 50 }), [program]);
  const leaders = data?.data ?? [];
  const avgEpa = leaders.reduce((sum, row) => sum + (row.epa?.total ?? 0), 0) / Math.max(leaders.length, 1);

  return (
    <section className="page">
      <PageTitle icon={<BarChart3 />} title="Insights" subtitle="SuperScore, EPA, TrueSkill, and signature-win leaderboards from RoboStem." />
      <div className="segmented">
        <button className={program === "v5rc" ? "active" : ""} onClick={() => setProgram("v5rc")}>
          V5RC
        </button>
        <button className={program === "viqrc" ? "active" : ""} onClick={() => setProgram("viqrc")}>
          VIQRC
        </button>
      </div>
      <div className="stats-row">
        <Metric icon={<Trophy />} label="Ranked teams" value={data?.meta.total ?? 0} />
        <Metric icon={<Activity />} label="Average EPA top 50" value={Math.round(avgEpa)} />
        <Metric icon={<Medal />} label="Rows shown" value={leaders.length} />
      </div>
      <Panel title={`${program.toUpperCase()} SuperScore Rankings`} icon={<BarChart3 />}>
        <Status loading={loading} error={error} />
        <table>
          <thead>
            <tr>
              <th>Rank</th>
              <th>Team</th>
              <th>SuperScore</th>
              <th>EPA</th>
              <th>Auto Skill</th>
              <th>TrueSkill</th>
              <th>Matches</th>
              <th>Signature Wins</th>
            </tr>
          </thead>
          {loading ? (
            <LoadingTable columns={8} />
          ) : (
            <tbody>
              {leaders.map((row) => (
                <tr key={`${row.rank}-${row.team.id}`}>
                  <td>{row.rank}</td>
                  <td>
                    <Link href={teamSlugPath(program.toUpperCase(), row.team.number, row.team.id)}>{row.team.number}</Link>
                    <div className="muted">{row.team.name}</div>
                  </td>
                  <td>{formatNumber(row.superscore, 2)}</td>
                  <td>{formatNumber(row.epa?.total, 2)}</td>
                  <td>{formatNumber(row.auto_skill, 2)}</td>
                  <td>{formatNumber(row.trueskill?.mu, 2)}</td>
                  <td>{row.total_matches ?? "-"}</td>
                  <td>{row.signature_wins ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          )}
        </table>
      </Panel>
    </section>
  );
}

function NotFound() {
  return (
    <section className="page">
      <PageTitle icon={<ExternalLink />} title="Page Not Found" subtitle="That stemScout route does not exist yet." />
      <Link href="/" className="button-link">
        Go home
      </Link>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Beta disclaimer (first-visit modal)
// ---------------------------------------------------------------------------

function BetaDisclaimer() {
  const [visible, setVisible] = useState(() => !localStorage.getItem("beta-disclaimer-seen"));

  function dismiss() {
    localStorage.setItem("beta-disclaimer-seen", "1");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="beta-overlay" role="dialog" aria-modal="true" aria-label="Beta disclaimer">
      <div className="beta-modal">
        <div className="beta-modal-icon">🔒</div>
        <h2 className="beta-modal-title">Internal Preview</h2>
        <p className="beta-modal-body">
          This is an internal, unreleased version of stemScout. Everything is subject to change — features, data, and
          design may be incomplete or inaccurate.
        </p>
        <p className="beta-modal-legal">
          By continuing to use this website you agree to our{" "}
          <Link href="/terms" onClick={dismiss}>
            Terms &amp; Conditions
          </Link>
          , including the confidentiality provisions that apply to this preview.
        </p>
        <button className="beta-modal-btn" onClick={dismiss}>
          I Understand
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Terms & Conditions page
// ---------------------------------------------------------------------------

function TermsPage() {
  return (
    <section className="page terms-page">
      <PageTitle icon={<Shield />} title="Terms & Conditions" subtitle="Last updated: May 2026" />
      <div className="terms-body">
        <h3>1. About stemScout</h3>
        <p>
          stemScout is a web-based scouting and analytics tool for VEX Robotics events, operated by Alexander Deng
          ("we", "us"). It is currently an internal preview and has not been publicly released.
        </p>

        <h3>2. Eligibility</h3>
        <p>
          You must be at least 13 years old to use stemScout. By accessing this site you confirm that you meet this
          requirement. Users under 18 should have parental or guardian consent.
        </p>

        <h3>3. Confidentiality (Preview Users)</h3>
        <p>
          <strong>
            Access to this unreleased preview version of stemScout is by explicit invitation only. If you have been
            granted access, you agree to the following:
          </strong>
        </p>
        <ul>
          <li>
            You will <strong>not</strong> share, demonstrate, screenshot, screen-record, or otherwise disclose any
            features, functionality, data, or existence of stemScout to any person who has not been explicitly
            authorized to access it by Alexander Deng.
          </li>
          <li>
            You will <strong>not</strong> post about stemScout on social media, Discord servers, forums, or any other
            public or semi-public channel without prior written permission from Alexander Deng.
          </li>
          <li>
            You understand that features shown in this preview are experimental and may change significantly or be
            removed before any public release.
          </li>
          <li>
            Violation of these confidentiality terms may result in immediate revocation of your access.
          </li>
        </ul>

        <h3>4. Acceptable Use</h3>
        <p>You agree not to:</p>
        <ul>
          <li>Attempt to reverse-engineer, scrape, or overload the service or its upstream APIs.</li>
          <li>Use stemScout for any unlawful purpose.</li>
          <li>Attempt to gain unauthorized access to any systems connected to stemScout.</li>
        </ul>

        <h3>5. Data &amp; Privacy</h3>
        <p>
          stemScout displays publicly available VEX Robotics event and team data sourced from RobotEvents and the
          RoboStem database. We store minimal data in your browser (localStorage / IndexedDB) to cache event listings
          and your preferences. No personal data is sent to our servers at this time.
        </p>

        <h3>6. No Warranty</h3>
        <p>
          stemScout is provided "as is" without warranties of any kind. Data may be incomplete or inaccurate. We are
          not affiliated with the Robotics Education &amp; Competition (REC) Foundation or VEX Robotics.
        </p>

        <h3>7. Limitation of Liability</h3>
        <p>
          To the maximum extent permitted by applicable law, Alexander Deng shall not be liable for any indirect,
          incidental, or consequential damages arising from your use of stemScout.
        </p>

        <h3>8. Changes to These Terms</h3>
        <p>
          These terms may be updated at any time. Continued use of stemScout after any change constitutes acceptance of
          the updated terms.
        </p>

        <h3>9. Contact</h3>
        <p>
          Questions or concerns? Reach out to Alexander Deng directly via the channels through which you were granted
          access.
        </p>
      </div>
    </section>
  );
}

function route(path: string) {
  if (path === "/") return <Home />;
  if (path === "/events") return <EventsPage />;
  if (path === "/teams") return <TeamsPage />;
  if (path === "/insights") return <InsightsPage />;
  if (path === "/terms") return <TermsPage />;
  const eventMatch = path.match(/^\/events?\/(.+)$/);
  if (eventMatch) return <EventDetail param={decodeURIComponent(eventMatch[1])} />;
  const teamMatch = path.match(/^\/teams?\/(.+)$/);
  if (teamMatch) return <TeamDetail param={teamMatch[1]} />;
  return <NotFound />;
}

export default function App() {
  const path = useRoute();
  useEffect(() => {
    loadYouTubeApi();
  }, []);
  return (
    <>
      <BetaDisclaimer />
      <Layout path={path}>{route(path)}</Layout>
    </>
  );
}
