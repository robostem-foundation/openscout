import {
  Activity,
  Award as AwardIcon,
  BarChart3,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Gamepad2,
  ListFilter,
  Link as LinkIcon,
  Medal,
  PanelRight,
  Pause,
  Play,
  Search,
  Shield,
  Star,
  Trophy,
  Unlink,
  Users,
  Youtube,
} from "lucide-react";
import { FormEvent, Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, KeyboardEvent, ReactNode, SetStateAction } from "react";
import { api } from "./api";
import type { Award, CountryGroup, Event, JumperPresetExists, Match, MatchTimestamp, PageMeta, Paginated, Ranking, Season, Skill, Team } from "./types";

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
const teamCacheRefreshMs = 3 * 60 * 1000;
type EventCategory = "Worlds" | "Signature" | "Championship" | "Other";
type EventSort = "smart" | "date" | "type" | "name" | "program" | "location";
type EventWindow = "near" | "upcoming" | "next30" | "next90" | "past30" | "allSeason";
type EventFilterLayout = "sidebar" | "inline";
type RegionOptionKind = "country" | "subdivision" | "vex-region";
type DateDirection = "asc" | "desc";
type TeamDataKind = "matches" | "rankings" | "skills" | "awards";
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

function Link({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a
      href={href}
      className={className}
      onClick={(event) => {
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

function cachedTeamsKey(program: string, region: string, registered: string) {
  return JSON.stringify({ program, region, registered });
}

async function loadCachedTeams(cacheKey: string, query: Parameters<typeof api.teams>[0]) {
  const cached = teamListCache.get(cacheKey);
  if (cached?.promise) return cached.promise;

  const promise = collectAllPages<Team>((page) => api.teams({ ...query, page })).then((result) => {
    const sortedResult = { ...result, data: [...result.data].sort(compareTeamsNatural) };
    teamListCache.set(cacheKey, { data: sortedResult, updatedAt: Date.now() });
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

function gradeCode(grade?: string | null) {
  const value = (grade ?? "").toLowerCase();
  if (value.includes("elementary")) return "ES";
  if (value.includes("middle")) return "MS";
  if (value.includes("high")) return "HS";
  return grade || "-";
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

function isIqProgram(event?: Event | null) {
  const code = event?.program.code ?? "";
  const name = event?.program.name ?? "";
  return /VIQ|IQ/i.test(`${code} ${name}`);
}

function highlightAwards(awards: Award[], event?: Event | null): HighlightAward[] {
  const hasWinners = (award: Award) => (award.teamWinners?.length ?? 0) > 0 || (award.individualWinners?.length ?? 0) > 0;
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
}) {
  const needle = (options.search ?? "").trim().toLowerCase();
  const seasonIds = options.seasonIds ?? [];
  const programIds = options.programIds ?? [];

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

function Pager({ meta, onPage }: { meta?: PageMeta; onPage: (page: number) => void }) {
  if (!meta) return null;

  return (
    <div className="pager">
      <button disabled={meta.current_page <= 1} onClick={() => onPage(meta.current_page - 1)} aria-label="Previous page">
        <ChevronLeft size={16} />
      </button>
      <span>
        Page {meta.current_page.toLocaleString()} of {meta.last_page.toLocaleString()} · {meta.total.toLocaleString()} total
      </span>
      <button disabled={meta.current_page >= meta.last_page} onClick={() => onPage(meta.current_page + 1)} aria-label="Next page">
        <ChevronRight size={16} />
      </button>
    </div>
  );
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
  return (
    <Link href={`/team/${team.id}`} className={className}>
      {team.name}
    </Link>
  );
}

function AllianceTeamLinks({ teams, focusTeamId }: { teams?: Match["alliances"][number]["teams"]; focusTeamId?: number }) {
  if (!teams?.length) return <>-</>;

  return (
    <span className="team-link-list">
      {teams.map((entry) => {
        const focusClass = focusTeamId ? (entry.team.id === focusTeamId ? "team-chip team-chip-focus" : "team-chip team-chip-muted") : undefined;
        return <TeamMiniLink key={entry.team.id} team={entry.team} className={focusClass} />;
      })}
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
    ["/", "The VEX Alliance"],
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
            <span>The VEX Alliance</span>
          </Link>
          <nav>
            {nav.slice(1).map(([href, label]) => (
              <Link key={href} href={href} className={path === href ? "active" : ""}>
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main>{children}</main>
      <footer>
        <div>Event data from RobotEvents. Team stats and SuperScore from RoboStem DB.</div>
        <div className="footer-links">
          <Link href="/events">Events</Link>
          <Link href="/teams">Teams</Link>
          <Link href="/insights">Insights</Link>
        </div>
      </footer>
    </>
  );
}

function Home() {
  const [search, setSearch] = useState("");
  const { data: events, loading: eventsLoading, error: eventsError } = useAsync(
    () =>
      api.events({
        start: dateOnly(addDays(today, -30)),
        end: dateOnly(addDays(today, 120)),
        per_page: 100,
        "program[]": vexProgramIds,
      }),
    [],
  );
  const { data: rankings, loading: rankingsLoading } = useAsync(() => api.superscore("v5rc", { per_page: 8 }), []);
  const homeEvents = useMemo(
    () => filterAndSortEvents(events?.data ?? [], { hideCanceled: true, sort: "smart" }).slice(0, 60),
    [events],
  );

  function submit(event: FormEvent) {
    event.preventDefault();
    const q = search.trim();
    if (!q) return;
    if (/^\d+[a-z]?$/i.test(q)) {
      navigate(`/teams?search=${encodeURIComponent(q)}`);
      return;
    }
    navigate(`/events?search=${encodeURIComponent(q)}`);
  }

  return (
    <section className="page">
      <div className="beta-link">
        <a href="https://robostem-api.org/" target="_blank" rel="noreferrer">
          RoboStem DB API
        </a>
      </div>
      <div className="hero">
        <h2>Welcome to The VEX Alliance's coverage of VEX Robotics Competition data!</h2>
        <h4>Match results, rankings, skills, awards, and team histories powered by RoboStem DB.</h4>
        <form className="global-search" onSubmit={submit}>
          <Search size={16} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search a team number, event, city, or SKU" />
          <button>Search</button>
        </form>
        <div className="home-actions">
          <Link href="/events" className="button-link">
            Events
          </Link>
          <Link href="/teams" className="button-link secondary">
            Teams
          </Link>
        </div>
      </div>

      <div className="home-grid">
        <Panel title={`VEX Robotics Competition Events ${homeEvents.length || ""}`} icon={<CalendarDays />}>
          <Status loading={eventsLoading} error={eventsError} />
          <EventTable events={homeEvents} loading={eventsLoading} compact showPriority />
        </Panel>
        <Panel title="V5RC SuperScore Leaders" icon={<Trophy />}>
          <table>
            <thead>
              <tr>
                <th>Rank</th>
                <th>Team</th>
                <th>SuperScore</th>
                <th>EPA</th>
              </tr>
            </thead>
            {rankingsLoading ? (
              <LoadingTable columns={4} />
            ) : (
              <tbody>
                {(rankings?.data ?? []).map((row) => (
                  <tr key={row.team.id}>
                    <td>{row.rank}</td>
                    <td>
                      <Link href={`/team/${row.team.id}`}>{row.team.number}</Link>
                      <div className="muted">{row.team.name}</div>
                    </td>
                    <td>{formatNumber(row.superscore, 2)}</td>
                    <td>{formatNumber(row.epa?.total, 2)}</td>
                  </tr>
                ))}
              </tbody>
            )}
          </table>
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

function Panel({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="panel">
      <h2>
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
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
  const [level, setLevel] = useState("");
  const [selectedRegionKeys, setSelectedRegionKeys] = useState<string[]>([]);
  const [regionMenuOpen, setRegionMenuOpen] = useState(false);
  const [regionTab, setRegionTab] = useState<RegionOptionKind>("country");
  const [regionSearch, setRegionSearch] = useState("");
  const [eventWindow, setEventWindow] = useState<EventWindow>("near");
  const [sort, setSort] = useState<EventSort>("smart");
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [filterLayout, setFilterLayout] = useState<EventFilterLayout>("sidebar");
  const [selectedSeasonIds, setSelectedSeasonIds] = useState<number[]>([]);
  const [seasonSelectionTouched, setSeasonSelectionTouched] = useState(false);
  const [seasonMenuOpen, setSeasonMenuOpen] = useState(false);
  const [hideCanceled, setHideCanceled] = useState(true);
  const [page, setPage] = useState(1);
  const selectedProgramKey = selectedProgramIds.join(",");
  const selectedSeasonKey = selectedSeasonIds.join(",");
  const queryKey = `${eventWindow}:${selectedProgramKey}:${level}:${selectedSeasonKey}`;
  const dateWindow = eventWindowDates(eventWindow);
  const seasons = useAsync(() => collectAllPages<Season>((page) => api.robotEventsSeasons({ page, per_page: 250 })), []);
  const countries = useAsync(() => api.robotEventsCountries(), []);
  const countryRegions = useAsync(() => api.robotEventsRegions(), []);
  const { data, loading, error } = useAsync(
    () =>
      api.events({
        start: dateWindow.start,
        end: dateWindow.end,
        "program[]": selectedProgramIds.length ? selectedProgramIds : undefined,
        "level[]": level === "Championship" ? ["National", "State", "Regional"] : level && level !== "Other" ? [level] : undefined,
        "season[]": selectedSeasonIds.length ? selectedSeasonIds : undefined,
        per_page: 250,
      }),
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
  const selectedProgramLabels = programOptions
    .filter((option) => option.value && selectedProgramIds.includes(option.value))
    .map((option) => option.label);
  const programButtonLabel =
    !selectedProgramIds.length || selectedProgramIds.length === programOptions.length - 1
      ? "All programs"
      : selectedProgramIds.length === 1
        ? selectedProgramLabels[0] ?? "Program"
        : `${selectedProgramIds.length} programs`;
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
  const visibleEvents = useMemo(
    () =>
      filterAndSortEvents(data?.data ?? [], {
        programIds: selectedProgramIds,
        level,
        regionOptions: selectedRegionOptions,
        seasonIds: selectedSeasonIds,
        hideCanceled,
        sort,
      }),
    [data, selectedProgramIds, level, selectedRegionOptions, selectedSeasonIds, hideCanceled, sort],
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
  }, [selectedProgramIds, level, selectedRegionKeys, eventWindow, sort, selectedSeasonIds, hideCanceled]);

  useEffect(() => {
    setQuickSearchLimit(3);
    setActiveQuickResult(0);
  }, [quickSearch, visibleEvents]);

  useEffect(() => {
    window.localStorage.setItem("vex-events-programs", JSON.stringify(selectedProgramIds));
  }, [selectedProgramIds]);

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
      setSelectedRegionKeys((keys) => keys.filter((key) => availableKeys.has(key)));
    }
  }, [selectedRegionKeys, regionOptions]);

  const toggleSeason = (seasonId: number) => {
    setSeasonSelectionTouched(true);
    setSelectedSeasonIds((ids) => (ids.includes(seasonId) ? ids.filter((id) => id !== seasonId) : [...ids, seasonId]));
  };
  const toggleProgram = (programId: string) => {
    setSelectedProgramIds((ids) => (ids.includes(programId) ? ids.filter((id) => id !== programId) : [...ids, programId]));
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
    if (event) navigate(`/event/${event.id}`);
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
          <button className={eventWindow === "upcoming" ? "active" : ""} onClick={() => { setEventWindow("upcoming"); setSort("date"); }}>
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
          <button className={level === "World" ? "active" : ""} onClick={() => setQuickFilter("World", eventWindow, "date")}>
            Worlds
          </button>
          <button className={level === "Signature" ? "active" : ""} onClick={() => setQuickFilter("Signature", eventWindow, "date")}>
            Signature
          </button>
          <button className={level === "Championship" ? "active" : ""} onClick={() => setQuickFilter("Championship", eventWindow, "date")}>
            Championships
          </button>
          <button className={level === "Other" ? "active" : ""} onClick={() => setLevel("Other")}>
            Other
          </button>
        </div>
      </div>
      <div className="event-filter-fields">
        <div className="filter-field">
          <span>Programs</span>
          <div className="picker-menu">
            <button type="button" onClick={() => setProgramMenuOpen((open) => !open)} aria-expanded={programMenuOpen}>
              {programButtonLabel}
            </button>
            {programMenuOpen && (
              <div className="picker-menu-list">
                <div className="picker-menu-actions">
                  <button type="button" onClick={selectAllPrograms}>
                    All
                  </button>
                  <button type="button" onClick={clearPrograms}>
                    Clear
                  </button>
                </div>
                {programOptions
                  .filter((option) => option.value)
                  .map((option) => (
                    <label key={option.value}>
                      <input type="checkbox" checked={selectedProgramIds.includes(option.value)} onChange={() => toggleProgram(option.value)} />
                      <span>{option.label}</span>
                    </label>
                  ))}
              </div>
            )}
          </div>
        </div>
        <div className="filter-field">
          <span>Region</span>
          <div className="picker-menu">
            <button type="button" onClick={() => setRegionMenuOpen((open) => !open)} aria-expanded={regionMenuOpen}>
              {regionButtonLabel}
            </button>
            {regionMenuOpen && (
              <div className="picker-menu-list region-menu-list">
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
            <button type="button" onClick={() => setSortMenuOpen((open) => !open)} aria-expanded={sortMenuOpen}>
              {sortLabel}
            </button>
            {sortMenuOpen && (
              <div className="picker-menu-list">
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
        <div className="filter-field">
          <span>Seasons</span>
          <div className="picker-menu">
            <button type="button" onClick={() => setSeasonMenuOpen((open) => !open)} aria-expanded={seasonMenuOpen}>
              {seasonButtonLabel}
            </button>
            {seasonMenuOpen && (
              <div className="picker-menu-list">
                <div className="picker-menu-actions">
                  <button type="button" onClick={selectAllSeasons}>
                    All
                  </button>
                  <button type="button" onClick={clearSeasons}>
                    Clear
                  </button>
                </div>
                {seasonOptions.map((season) => (
                  <label key={season.id}>
                    <input type="checkbox" checked={selectedSeasonIds.includes(season.id)} onChange={() => toggleSeason(season.id)} />
                    <span>{season.label}</span>
                    {season.program && <small>{season.program}</small>}
                  </label>
                ))}
                {!seasonOptions.length && <div className="picker-menu-empty">Loading seasons...</div>}
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
          <EventTable events={pageEvents} loading={loading} showPriority showSeason={!selectedSeasonIds.length || allSeasonsSelected} />
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
        </Panel>
        {filterLayout === "sidebar" && (
          <aside className="event-filter-sidebar">
            <div className="event-filter-sidebar-title">Filters</div>
            {filterControls}
          </aside>
        )}
      </div>
    </section>
  );
}

function EventTable({
  events,
  loading,
  compact = false,
  showPriority = false,
  showSeason = false,
}: {
  events: Event[];
  loading: boolean;
  compact?: boolean;
  showPriority?: boolean;
  showSeason?: boolean;
}) {
  const showProgram = !compact;
  const showLevel = !compact && !showPriority;
  const columnCount = 3 + (showPriority ? 1 : 0) + (showProgram ? 1 : 0) + (showSeason ? 1 : 0) + (showLevel ? 1 : 0);

  return (
    <table>
      <thead>
        <tr>
          <th>Event</th>
          {showPriority && <th>Priority</th>}
          {showProgram && <th>Program</th>}
          {showSeason && <th>Season</th>}
          <th>Location</th>
          <th>Dates</th>
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
                <Link href={`/event/${event.id}`}>{event.name}</Link>
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
  const debouncedSearch = useDebouncedValue(search.trim(), 250);
  const [program, setProgram] = useState("1");
  const [region, setRegion] = useState("");
  const [registered, setRegistered] = useState("true");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paginated<Team> | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cacheKey = cachedTeamsKey(program, region, registered);
  const isSearchingTeams = !!debouncedSearch;

  useEffect(() => {
    let live = true;
    const baseQuery = {
      "program[]": program ? [program] : undefined,
      "country[]": region,
      registered: registered === "" ? undefined : registered,
    };

    const loadTeams = async ({ background = false } = {}) => {
      setError(null);
      if (!background) setLoading(true);
      if (background) setRefreshing(true);

      try {
        const result = isSearchingTeams
          ? await api.teams({
              ...baseQuery,
              teamSearch: debouncedSearch,
              page,
              per_page: 50,
            })
          : await loadCachedTeams(cacheKey, {
              ...baseQuery,
              per_page: 250,
            });

        if (live) setData(isSearchingTeams ? { ...result, data: [...result.data].sort(compareTeamsNatural) } : result);
      } catch (err) {
        if (live) setError((err as Error).message);
      } finally {
        if (live) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    };

    if (isSearchingTeams) {
      loadTeams();
      return () => {
        live = false;
      };
    }

    const cached = teamListCache.get(cacheKey);
    const cacheAge = cached?.updatedAt ? Date.now() - cached.updatedAt : Number.POSITIVE_INFINITY;

    if (cached?.data) {
      setData(cached.data);
      setLoading(false);
    }

    if (!cached?.data || cacheAge >= teamCacheRefreshMs) {
      loadTeams({ background: !!cached?.data });
    }

    const interval = window.setInterval(() => loadTeams({ background: true }), teamCacheRefreshMs);

    return () => {
      live = false;
      window.clearInterval(interval);
    };
  }, [cacheKey, debouncedSearch, isSearchingTeams, page, program, region, registered]);

  const sortedTeams = useMemo(() => [...(data?.data ?? [])].sort(compareTeamsNatural), [data]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, program, region, registered]);

  const tableTeams = isSearchingTeams ? sortedTeams : data?.data ?? [];

  return (
    <section className="page">
      <PageTitle icon={<Users />} title="Teams" subtitle="Search team numbers, names, regions, programs, grade levels, and registration status." />
      <SearchFilters
        search={search}
        setSearch={(value) => {
          setSearch(value);
          setPage(1);
        }}
        program={program}
        setProgram={(value) => {
          setProgram(value);
          setPage(1);
        }}
        region={region}
        setRegion={(value) => {
          setRegion(value);
          setPage(1);
        }}
        placeholder="Search team number, name, or region"
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
      <Panel title="Team List" icon={<Users />}>
        <Status loading={loading} error={error} />
        {refreshing && !loading && <div className="notice subtle">Updating cached teams...</div>}
        <TeamTable teams={tableTeams} loading={loading} localPageSize={isSearchingTeams ? undefined : 50} />
        {isSearchingTeams ? <Pager meta={data?.meta} onPage={setPage} /> : null}
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
            <th>Status</th>
          </tr>
        </thead>
        {loading ? (
          <LoadingTable columns={6} />
        ) : (
          <tbody>
            {visibleTeams.map((team) => {
              const expanded = expandedTeamId === team.id;
              return (
                <Fragment key={team.id}>
                  <tr key={team.id} className="team-row" onClick={() => setExpandedTeamId(expanded ? null : team.id)}>
                    <td className="team-cell truncate-cell">
                      <Link href={`/team/${team.id}`}>{team.number}</Link>
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
                  </tr>
                  {expanded && (
                    <tr key={`${team.id}-details`} className="team-detail-row">
                      <td colSpan={6}>
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
                            <Link href={`/team/${team.id}`} className="button-link secondary">
                              View stats of {team.number}
                            </Link>
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
                <td colSpan={6}>
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
    () => api.teamMatches(teamId, { "event[]": eventId ? [eventId] : undefined, per_page: eventId ? 250 : 6, page: 1 }),
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
                  <Link href={`/event/${match.event.id}`}>{match.event.name}</Link>
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
  program,
  setProgram,
  region,
  setRegion,
  placeholder,
  children,
}: {
  search: string;
  setSearch: (value: string) => void;
  program: string;
  setProgram: (value: string) => void;
  region: string;
  setRegion: (value: string) => void;
  placeholder: string;
  children?: ReactNode;
}) {
  return (
    <div className="filters">
      <label>
        <Search size={16} />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={placeholder} />
      </label>
      <select value={program} onChange={(event) => setProgram(event.target.value)}>
        {programOptions.map((option) => (
          <option key={option.value || "all"} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <input value={region} onChange={(event) => setRegion(event.target.value)} placeholder="Region or country" />
      {children}
    </div>
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

function EventDetail({ id }: { id: string }) {
  const [tab, setTab] = useState("matches");
  const [selectedDivision, setSelectedDivision] = useState<number | null>(null);
  const [playback, setPlayback] = useState<MatchPlayback | null>(null);
  const { data: event, loading, error } = useAsync(() => api.event(id), [id]);
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
      if (!event || tab !== "matches") return null;
      return collectAllPages<Match>((page) => api.eventMatches(id, division, { per_page: 250, page }));
    },
    [id, division, event?.id, tab],
  );
  const rankings = useAsync(
    async () => {
      if (!event || tab !== "rankings") return null;
      return collectAllPages<Ranking>((page) => api.eventRankings(id, division, { per_page: 250, page }));
    },
    [id, division, event?.id, tab],
  );
  const skills = useAsync(
    async () => {
      if (!event || tab !== "skills") return null;
      return collectAllPages<Skill>((page) => api.eventSkills(id, { per_page: 250, page }));
    },
    [id, event?.id, tab],
  );
  const teams = useAsync(
    async () => {
      if (!event || tab !== "teams") return null;
      return collectAllPages<Team>((page) => api.eventTeams(id, { per_page: 250, page }));
    },
    [id, event?.id, tab],
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

  const eventAwards = awards.data?.data ?? [];
  const timestampMap = useMemo(() => new Map((matchTimestamps.data ?? []).map((timestamp) => [timestamp.id, timestamp])), [matchTimestamps.data]);
  const presetUrl = event && preset.data?.exists ? `https://jumper.robostem.org/?preset=${encodeURIComponent(jumperPresetName(event, preset.data))}` : null;
  const activeStatus = tab === "matches" ? matches : tab === "rankings" ? rankings : tab === "skills" ? skills : tab === "awards" ? awards : teams;
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
      {tab === "matches" && (
        <MatchesTable
          matches={matches.data?.data ?? []}
          timestampMap={timestampMap}
          presetSupported={!!preset.data?.exists}
          presetLoading={preset.loading || (preset.data?.exists ? matchTimestamps.loading : false)}
          presetUrl={presetUrl}
          onOpenMatch={(match, timestamp) => setPlayback({ match, timestamp })}
        />
      )}
      {tab === "rankings" && <RankingsTable rankings={rankings.data?.data ?? []} />}
      {tab === "skills" && <SkillsTable skills={skills.data?.data ?? []} />}
      {tab === "awards" && <AwardsList awards={awards.data?.data ?? []} />}
      {tab === "teams" && !teams.loading && teams.data && (
        <div className="table-summary">Showing 80 per page from {teams.data.data.length.toLocaleString()} RobotEvents teams.</div>
      )}
      {tab === "teams" && <TeamTable teams={teams.data?.data ?? []} loading={teams.loading} localPageSize={80} eventId={event.id} />}
      {playback && <MatchVideoOverlay playback={playback} onClose={() => setPlayback(null)} />}
    </section>
  );
}

function TeamDetail({ id }: { id: string }) {
  const [tab, setTab] = useState("events");
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(null);
  const [dateDirection, setDateDirection] = useState<DateDirection>("asc");
  const [matchesBySeason, setMatchesBySeason] = useState<Record<number, AsyncBucket<Match>>>({});
  const [rankingsBySeason, setRankingsBySeason] = useState<Record<number, AsyncBucket<Ranking>>>({});
  const [skillsBySeason, setSkillsBySeason] = useState<Record<number, AsyncBucket<Skill>>>({});
  const [awardsBySeason, setAwardsBySeason] = useState<Record<number, AsyncBucket<Award>>>({});
  const inFlightTeamData = useRef(new Set<string>());
  const { data: team, loading, error } = useAsync(() => api.team(id), [id]);
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
    tab === "events"
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

  return (
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
        onChange={setTab}
        tabs={[
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
      <DateDirectionToggle direction={dateDirection} onChange={setDateDirection} />
      <Status loading={activeStatus.loading} error={activeStatus.error} />
      {!activeStatus.loading && !events.loading && selectedSeason && (
        <div className="table-summary">
          Showing {selectedSeason.label} only. Change season to review another year.
        </div>
      )}
      {!activeStatus.loading && tab === "events" && <EventTable events={seasonEvents} loading={events.loading} />}
      {!activeStatus.loading && tab === "matches" && (
        <TeamMatchesByEvent
          matches={selectedMatches.data}
          eventIndex={eventIndex}
          seasonId={selectedSeasonId}
          focusTeamId={team.id}
          direction={dateDirection}
        />
      )}
      {!activeStatus.loading && tab === "rankings" && (
        <TeamRankingsByEvent rankings={selectedRankings.data} eventIndex={eventIndex} seasonId={selectedSeasonId} direction={dateDirection} />
      )}
      {!activeStatus.loading && tab === "skills" && <TeamSkillsByEvent skills={selectedSkills.data} eventIndex={eventIndex} seasonId={selectedSeasonId} direction={dateDirection} />}
      {!activeStatus.loading && tab === "awards" && (
        <TeamAwardsByEvent awards={selectedAwards.data} eventIndex={eventIndex} seasonId={selectedSeasonId} focusTeamId={team.id} direction={dateDirection} />
      )}
    </section>
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

function EventGroupTitle({ eventRef, event, count }: { eventRef: { id: number; name: string; code?: string | null }; event?: Event; count: number }) {
  return (
    <>
      <span>
        <Link href={`/event/${eventRef.id}`}>{eventRef.name}</Link>
        <small>{event?.sku ?? eventRef.code ?? ""}</small>
      </span>
      <span className="event-group-meta">
        {event ? formatEventDateRange(event.start, event.end) : "Date unavailable"} · {count.toLocaleString()}
      </span>
    </>
  );
}

function TeamMatchesByEvent({
  matches,
  eventIndex,
  seasonId,
  focusTeamId,
  direction,
}: {
  matches: Match[];
  eventIndex: Map<number, Event>;
  seasonId: number | null;
  focusTeamId: number;
  direction: DateDirection;
}) {
  const groups = groupItemsByEvent(matches, eventIndex, seasonId, direction);

  return (
    <Panel title="Matches" icon={<Gamepad2 />}>
      <div className="event-groups">
        {groups.map((group, index) => (
          <details key={group.eventRef.id} className="event-group" open={index === 0}>
            <summary>
              <EventGroupTitle eventRef={group.eventRef} event={group.event} count={group.items.length} />
            </summary>
            <TeamMatchTable matches={group.items} focusTeamId={focusTeamId} />
          </details>
        ))}
        {!groups.length && <Empty>No matches returned for this season.</Empty>}
      </div>
    </Panel>
  );
}

function TeamMatchTable({ matches, focusTeamId }: { matches: Match[]; focusTeamId: number }) {
  const sortedMatches = [...matches].sort((a, b) => a.round - b.round || (a.instance ?? 0) - (b.instance ?? 0) || a.matchnum - b.matchnum);

  return (
    <table>
      <thead>
        <tr>
          <th>Match</th>
          <th>Red Alliance</th>
          <th>Blue Alliance</th>
          <th>Score</th>
        </tr>
      </thead>
      <tbody>
        {sortedMatches.map((match) => {
          const { red, blue, redScore, blueScore, winner } = matchWinner(match);

          return (
            <tr key={match.id}>
              <td>
                {match.name}
                {match.division?.name && <span className="muted inline-muted">{match.division.name}</span>}
              </td>
              <td className={winner === "Red" ? "winner-cell" : ""}>
                <AllianceTeamLinks teams={red?.teams} focusTeamId={focusTeamId} />
              </td>
              <td className={winner === "Blue" ? "winner-cell" : ""}>
                <AllianceTeamLinks teams={blue?.teams} focusTeamId={focusTeamId} />
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
  );
}

function TeamRankingsByEvent({
  rankings,
  eventIndex,
  seasonId,
  direction,
}: {
  rankings: Ranking[];
  eventIndex: Map<number, Event>;
  seasonId: number | null;
  direction: DateDirection;
}) {
  const groups = groupItemsByEvent(rankings, eventIndex, seasonId, direction);

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
                  <Link href={`/event/${group.eventRef.id}`}>{group.eventRef.name}</Link>
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
}: {
  skills: Skill[];
  eventIndex: Map<number, Event>;
  seasonId: number | null;
  direction: DateDirection;
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
            <th>Scores</th>
            <th>Attempts</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => {
            const entries = group.entries.sort((a, b) => a.type.localeCompare(b.type));
            const rank = entries.reduce<number | null>((best, entry) => {
              if (entry.rank === null || entry.rank === undefined) return best;
              return best === null ? entry.rank : Math.min(best, entry.rank);
            }, null);
            const total = entries.reduce((sum, entry) => sum + (entry.score ?? 0), 0);

            return (
              <tr key={group.eventRef.id}>
                <td>
                  <Link href={`/event/${group.eventRef.id}`}>{group.eventRef.name}</Link>
                  <div className="muted">{group.event?.sku ?? group.eventRef.code}</div>
                </td>
                <td>{rank ?? "-"}</td>
                <td>
                  <span className="skill-parts">
                    {entries.map((entry) => (
                      <span key={`${group.eventRef.id}-${entry.type}`}>
                        <strong className="capitalize">{entry.type}</strong> {entry.score ?? "-"}
                      </span>
                    ))}
                  </span>
                </td>
                <td>
                  <span className="skill-parts">
                    {entries.map((entry) => (
                      <span key={`${group.eventRef.id}-${entry.type}-attempts`}>
                        <strong className="capitalize">{entry.type}</strong> {entry.attempts ?? "-"}
                      </span>
                    ))}
                  </span>
                </td>
                <td>{total || "-"}</td>
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
}: {
  awards: Award[];
  eventIndex: Map<number, Event>;
  seasonId: number | null;
  focusTeamId: number;
  direction: DateDirection;
}) {
  const groups = groupItemsByEvent(awards, eventIndex, seasonId, direction);

  return (
    <Panel title="Awards" icon={<Medal />}>
      <div className="event-groups">
        {groups.map((group) => (
          <details key={group.eventRef.id} className="event-group" open>
            <summary>
              <EventGroupTitle eventRef={group.eventRef} event={group.event} count={group.items.length} />
            </summary>
            <div className="award-list">
              {sortAwards(group.items).map((award) => (
                <article className="award-item" key={award.id}>
                  <h3>{award.title}</h3>
                  <div className="winner-row">
                    {(award.teamWinners ?? []).map((winner) => (
                      <Link
                        key={`${award.id}-${winner.team.id}`}
                        href={`/team/${winner.team.id}`}
                        className={`winner-pill ${winner.team.id === focusTeamId ? "" : "other"}`}
                      >
                        {winner.team.name}
                      </Link>
                    ))}
                    {(award.individualWinners ?? []).map((winner) => (
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
                {(highlight.award.teamWinners ?? []).map((winner) => (
                  <TeamMiniLink key={`${highlight.award.id}-${winner.team.id}`} team={winner.team} />
                ))}
                {(highlight.award.individualWinners ?? []).map((winner) => (
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

function Tabs({ tabs, active, onChange }: { tabs: Array<[string, string, ReactNode]>; active: string; onChange: (tab: string) => void }) {
  return (
    <div className="tabs">
      {tabs.map(([id, label, icon]) => (
        <button key={id} className={active === id ? "active" : ""} onClick={() => onChange(id)}>
          {icon}
          {label}
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
}: {
  matches: Match[];
  timestampMap: Map<number, MatchTimestamp>;
  presetSupported: boolean;
  presetLoading: boolean;
  presetUrl: string | null;
  onOpenMatch: (match: Match, timestamp: MatchTimestamp) => void;
}) {
  const [qualificationDirection, setQualificationDirection] = useState<DateDirection>("asc");
  const qualificationMatches = matches
    .filter((match) => match.round === 2)
    .sort((a, b) => (qualificationDirection === "asc" ? 1 : -1) * (a.matchnum - b.matchnum));
  const playoffMatches = matches.filter((match) => match.round >= 3).sort((a, b) => a.round - b.round || a.matchnum - b.matchnum);
  const playoffGroups = playoffMatches.reduce<Map<string, Match[]>>((groups, match) => {
    const key = playoffRoundKey(match);
    groups.set(key, [...(groups.get(key) ?? []), match]);
    return groups;
  }, new Map());
  const allianceRows = allianceRowsFromMatches(matches);
  const playoffOrder = ["r16", "qf", "sf", "f"];

  return (
    <div className="results-layout">
      <section className="results-column">
        <h2>Qualification Results</h2>
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
        />
      </section>
      <section className="results-column">
        <h2>Alliances</h2>
        <AllianceSelectionTable alliances={allianceRows} />
        <h2>Playoff Results</h2>
        {playoffOrder
          .filter((key) => playoffGroups.has(key))
          .map((key) => (
            <section className="playoff-round" key={key}>
              <h3>{playoffRoundLabel(key)}</h3>
              <ResultsMatchTable
                matches={(playoffGroups.get(key) ?? []).sort((a, b) => (a.instance ?? 0) - (b.instance ?? 0) || a.matchnum - b.matchnum)}
                emptyText="No playoff matches returned."
                timestampMap={timestampMap}
                presetSupported={presetSupported}
                presetLoading={presetLoading}
                presetUrl={presetUrl}
                onOpenMatch={onOpenMatch}
              />
            </section>
          ))}
        {!playoffMatches.length && <Empty>No playoff matches returned.</Empty>}
      </section>
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
          <th>Red Alliance</th>
          <th>Blue Alliance</th>
          <th>Score</th>
        </tr>
      </thead>
      <tbody>
        {matches.map((match) => {
          const { red, blue, redScore, blueScore, winner } = matchWinner(match);
          const redTeams = red?.teams ?? [];
          const blueTeams = blue?.teams ?? [];
          const timestamp = timestampMap?.get(match.id);
          const canPlay = presetSupported && timestamp && timestamp.timestamp !== null && timestamp.videoId;

          return (
            <tr key={match.id}>
              <td className="play-cell">
                {canPlay ? (
                  <button
                    className="play-dot active"
                    onClick={() => onOpenMatch?.(match, timestamp)}
                    title={`Play ${match.name}`}
                  />
                ) : (
                  <span className="play-dot disabled" />
                )}
              </td>
              <td className="result-match-name">
                <span className="result-match-line">
                  <span className="result-match-label">{match.name}</span>
                  {match.round === 2 && match.field && (
                    <span className="result-field-name">
                      {match.field}
                    </span>
                  )}
                </span>
              </td>
              <td className={`alliance-cell red-alliance-cell ${winner === "Red" ? "winning-alliance-cell" : ""}`}>
                <AllianceTeamLinks teams={redTeams} />
              </td>
              <td className={`alliance-cell blue-alliance-cell ${winner === "Blue" ? "winning-alliance-cell" : ""}`}>
                <AllianceTeamLinks teams={blueTeams} />
              </td>
              <td className="score-cell">
                <span className={`score red ${winner === "Blue" ? "score-loser" : ""}`}>{redScore ?? "-"}</span>
                <span className={`score blue ${winner === "Red" ? "score-loser" : ""}`}>{blueScore ?? "-"}</span>
              </td>
            </tr>
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

function AllianceSelectionTable({ alliances }: { alliances: Array<[number, string[]]> }) {
  if (!alliances.length) return <Empty>No alliance selections returned.</Empty>;

  return (
    <table className="alliance-selection-table">
      <thead>
        <tr>
          <th>Seed</th>
          <th>Captain</th>
          <th>Pick 1</th>
        </tr>
      </thead>
      <tbody>
        {alliances.map(([seed, teams]) => (
          <tr key={`${seed}-${teams.join("-")}`}>
            <td>Seed {seed}</td>
            {Array.from({ length: 2 }).map((_, teamIndex) => (
              <td key={teamIndex}>{teams[teamIndex] ?? ""}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RankingsTable({ rankings }: { rankings: Ranking[] }) {
  const sortedRankings = [...rankings].sort((a, b) => a.rank - b.rank);

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
                <Link href={`/team/${row.team.id}`}>{row.team.name}</Link>
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
            <th>Scores</th>
            <th>Attempts</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const entries = [...row.entries].sort((a, b) => a.type.localeCompare(b.type));
            const total = entries.reduce((sum, entry) => sum + (entry.score ?? 0), 0);

            return (
              <tr key={row.team.id}>
                <td>{row.rank ?? "-"}</td>
                <td>
                  <Link href={`/team/${row.team.id}`}>{row.team.name}</Link>
                </td>
                <td>
                  <span className="skill-parts">
                    {entries.map((entry) => (
                      <span key={`${row.team.id}-${entry.type}`}>
                        <strong className="capitalize">{entry.type}</strong> {entry.score ?? "-"}
                      </span>
                    ))}
                  </span>
                </td>
                <td>
                  <span className="skill-parts">
                    {entries.map((entry) => (
                      <span key={`${row.team.id}-${entry.type}-attempts`}>
                        <strong className="capitalize">{entry.type}</strong> {entry.attempts ?? "-"}
                      </span>
                    ))}
                  </span>
                </td>
                <td>{total || "-"}</td>
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

  return (
    <Panel title="Awards" icon={<Medal />}>
      <div className="award-list">
        {sortedAwards.map((award) => (
          <article className="award-item" key={award.id}>
            <h3>{award.title}</h3>
            <div className="winner-row">
              {(award.teamWinners ?? []).map((winner) => (
                <Link key={`${award.id}-${winner.team.id}`} href={`/team/${winner.team.id}`} className="winner-pill">
                  {winner.team.name}
                </Link>
              ))}
              {(award.individualWinners ?? []).map((winner) => (
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
                    <Link href={`/team/${row.team.id}`}>{row.team.number}</Link>
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
      <PageTitle icon={<ExternalLink />} title="Page Not Found" subtitle="That VEX Alliance route does not exist yet." />
      <Link href="/" className="button-link">
        Go home
      </Link>
    </section>
  );
}

function route(path: string) {
  if (path === "/") return <Home />;
  if (path === "/events") return <EventsPage />;
  if (path === "/teams") return <TeamsPage />;
  if (path === "/insights") return <InsightsPage />;
  const eventMatch = path.match(/^\/event\/(\d+)/);
  if (eventMatch) return <EventDetail id={eventMatch[1]} />;
  const teamMatch = path.match(/^\/team\/(\d+)/);
  if (teamMatch) return <TeamDetail id={teamMatch[1]} />;
  return <NotFound />;
}

export default function App() {
  const path = useRoute();
  useEffect(() => {
    loadYouTubeApi();
  }, []);
  return <Layout path={path}>{route(path)}</Layout>;
}
