import {
  Activity,
  Award as AwardIcon,
  BarChart3,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Gamepad2,
  Medal,
  Search,
  Shield,
  Star,
  Trophy,
  Users,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { api } from "./api";
import type { Award, Event, Match, PageMeta, Paginated, Ranking, Skill, Team } from "./types";

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
const eventLevels = [
  { label: "All Event Types", value: "" },
  { label: "Worlds", value: "World" },
  { label: "Signature", value: "Signature" },
  { label: "National", value: "National" },
  { label: "State / Regional Championship", value: "State" },
  { label: "Everything Else", value: "Other" },
];

type EventCategory = "Worlds" | "Signature" | "Championship" | "Other";
type EventSort = "smart" | "date" | "type" | "name" | "program" | "location";
type EventWindow = "near" | "upcoming" | "next30" | "next90" | "past30" | "allSeason";

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

async function collectAllPages<T>(loader: (page: number) => Promise<Paginated<T>>) {
  const first = await loader(1);
  const extraPages = Array.from({ length: Math.max(0, first.meta.last_page - 1) }, (_, index) => index + 2);
  const rest = await Promise.all(extraPages.map((page) => loader(page)));

  return {
    ...first,
    data: [first, ...rest].flatMap((page) => page.data),
  };
}

function formatDate(value?: string | null) {
  if (!value) return "TBD";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function formatShortDate(value?: string | null) {
  if (!value) return "TBD";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(value));
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

function filterAndSortEvents(events: Event[], options: {
  search?: string;
  program?: string;
  level?: string;
  region?: string;
  hideCanceled?: boolean;
  sort?: EventSort;
}) {
  const needle = (options.search ?? "").trim().toLowerCase();
  const region = (options.region ?? "").trim().toLowerCase();

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
      if (region && !haystack.includes(region)) return false;
      if (options.program && String(event.program.id) !== options.program) return false;
      if (options.level) {
        if (options.level === "Championship" && eventCategory(event).label !== "Championship") return false;
        if (options.level !== "Championship" && event.level !== options.level) return false;
      }
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
  if (eventWindow === "allSeason") return { start: "2025-05-01", end: "2026-08-31" };
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

function TeamMiniLink({ team }: { team: { id: number; name: string } }) {
  return <Link href={`/team/${team.id}`}>{team.name}</Link>;
}

function AllianceTeamLinks({ teams }: { teams?: Match["alliances"][number]["teams"] }) {
  if (!teams?.length) return <>-</>;

  return (
    <span className="team-link-list">
      {teams.map((entry) => (
        <TeamMiniLink key={entry.team.id} team={entry.team} />
      ))}
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
  const [search, setSearch] = useState(params.get("search") ?? "");
  const [program, setProgram] = useState("");
  const [level, setLevel] = useState("");
  const [region, setRegion] = useState("");
  const [eventWindow, setEventWindow] = useState<EventWindow>("near");
  const [sort, setSort] = useState<EventSort>("smart");
  const [hideCanceled, setHideCanceled] = useState(true);
  const [page, setPage] = useState(1);
  const queryKey = `${eventWindow}:${program}:${level}`;
  const dateWindow = eventWindowDates(eventWindow);
  const { data, loading, error } = useAsync(
    () =>
      api.events({
        start: dateWindow.start,
        end: dateWindow.end,
        "program[]": program ? [program] : undefined,
        "level[]": level === "Championship" ? ["National", "State"] : level ? [level] : undefined,
        per_page: 250,
      }),
    [queryKey],
  );
  const visibleEvents = useMemo(
    () =>
      filterAndSortEvents(data?.data ?? [], {
        search,
        program,
        level,
        region,
        hideCanceled,
        sort,
      }),
    [data, search, program, level, region, hideCanceled, sort],
  );
  const pageSize = 40;
  const totalPages = Math.max(1, Math.ceil(visibleEvents.length / pageSize));
  const pageEvents = visibleEvents.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    setPage(1);
  }, [search, program, level, region, eventWindow, sort, hideCanceled]);

  return (
    <section className="page">
      <PageTitle icon={<CalendarDays />} title="Events" subtitle="Smart-sorted RobotEvents listings for finding the VEX events people actually care about first." />
      <div className="event-toolbar">
        <div className="quick-filters">
          <button className={eventWindow === "near" && sort === "smart" && !level ? "active" : ""} onClick={() => { setEventWindow("near"); setSort("smart"); setLevel(""); }}>
            Near today
          </button>
          <button className={level === "World" ? "active" : ""} onClick={() => { setLevel("World"); setEventWindow("allSeason"); setSort("smart"); }}>
            Worlds
          </button>
          <button className={level === "Signature" ? "active" : ""} onClick={() => { setLevel("Signature"); setEventWindow("allSeason"); setSort("smart"); }}>
            Signature
          </button>
          <button className={level === "Championship" ? "active" : ""} onClick={() => { setLevel("Championship"); setEventWindow("allSeason"); setSort("smart"); }}>
            Championships
          </button>
          <button className={eventWindow === "upcoming" ? "active" : ""} onClick={() => { setEventWindow("upcoming"); setSort("date"); }}>
            Upcoming
          </button>
        </div>
        <SearchFilters
          search={search}
          setSearch={setSearch}
          program={program}
          setProgram={setProgram}
          region={region}
          setRegion={setRegion}
          placeholder="Search loaded events, cities, venues, SKUs"
        >
          <select value={level} onChange={(event) => setLevel(event.target.value)}>
            {eventLevels.map((option) => (
              <option key={option.value || "all"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select value={eventWindow} onChange={(event) => setEventWindow(event.target.value as EventWindow)}>
            <option value="near">Closest to Today</option>
            <option value="upcoming">All Upcoming</option>
            <option value="next30">Next 30 Days</option>
            <option value="next90">Next 90 Days</option>
            <option value="past30">Past 30 Days</option>
            <option value="allSeason">2025-26 Season</option>
          </select>
          <select value={sort} onChange={(event) => setSort(event.target.value as EventSort)}>
            <option value="smart">Smart: type, then closest</option>
            <option value="date">Start Date</option>
            <option value="type">Event Type</option>
            <option value="program">Program</option>
            <option value="location">Location</option>
            <option value="name">Name</option>
          </select>
          <label className="checkbox-filter">
            <input type="checkbox" checked={hideCanceled} onChange={(event) => setHideCanceled(event.target.checked)} />
            Hide canceled
          </label>
        </SearchFilters>
      </div>
      <Panel title="Event List" icon={<CalendarDays />}>
        <Status loading={loading} error={error} />
        {!loading && (
          <div className="table-summary">
            Showing {pageEvents.length.toLocaleString()} of {visibleEvents.length.toLocaleString()} loaded RobotEvents results. Smart sort prioritizes Worlds,
            Signature Events, Championships, then everything else, with closest-to-today inside each tier.
          </div>
        )}
        <EventTable events={pageEvents} loading={loading} showPriority />
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
    </section>
  );
}

function EventTable({ events, loading, compact = false, showPriority = false }: { events: Event[]; loading: boolean; compact?: boolean; showPriority?: boolean }) {
  return (
    <table>
      <thead>
        <tr>
          <th>Event</th>
          {showPriority && <th>Priority</th>}
          {!compact && <th>Program</th>}
          <th>Location</th>
          <th>Dates</th>
          {!compact && <th>Level</th>}
        </tr>
      </thead>
      {loading ? (
        <LoadingTable columns={(compact ? 3 : 5) + (showPriority ? 1 : 0)} />
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
              {!compact && (
                <td>
                  <ProgramBadge program={event.program} />
                </td>
              )}
              <td>{locationLine(event)}</td>
              <td>
                {formatShortDate(event.start)} - {formatShortDate(event.end)}
              </td>
              {!compact && <td>{event.level ?? "Other"}</td>}
            </tr>
          ))}
          {!events.length && (
            <tr>
              <td colSpan={(compact ? 3 : 5) + (showPriority ? 1 : 0)}>
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
  const [program, setProgram] = useState("");
  const [region, setRegion] = useState("");
  const [registered, setRegistered] = useState("");
  const [page, setPage] = useState(1);
  const queryKey = `${search}:${program}:${region}:${registered}:${page}`;
  const { data, loading, error } = useAsync(
    () =>
      api.teams({
        teamSearch: search,
        "program[]": program ? [program] : undefined,
        "country[]": region,
        registered: registered === "" ? undefined : registered,
        page,
        per_page: 30,
      }),
    [queryKey],
  );

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
        <select value={registered} onChange={(event) => setRegistered(event.target.value)}>
          <option value="">Any Status</option>
          <option value="true">Registered</option>
          <option value="false">Inactive</option>
        </select>
      </SearchFilters>
      <Panel title="Team List" icon={<Users />}>
        <Status loading={loading} error={error} />
        <TeamTable teams={data?.data ?? []} loading={loading} />
        <Pager meta={data?.meta} onPage={setPage} />
      </Panel>
    </section>
  );
}

function TeamTable({ teams, loading, localPageSize }: { teams: Team[]; loading: boolean; localPageSize?: number }) {
  const [page, setPage] = useState(1);
  const totalPages = localPageSize ? Math.max(1, Math.ceil(teams.length / localPageSize)) : 1;
  const visibleTeams = localPageSize ? teams.slice((page - 1) * localPageSize, page * localPageSize) : teams;

  useEffect(() => {
    setPage(1);
  }, [teams, localPageSize]);

  return (
    <>
      <table>
        <thead>
          <tr>
            <th>Team</th>
            <th>Program</th>
            <th>Organization</th>
            <th>Location</th>
            <th>Grade</th>
            <th>Status</th>
          </tr>
        </thead>
        {loading ? (
          <LoadingTable columns={6} />
        ) : (
          <tbody>
            {visibleTeams.map((team) => (
              <tr key={team.id}>
                <td className="team-cell">
                  <Link href={`/team/${team.id}`}>{team.number}</Link>
                  {team.team_name && <span>{team.team_name}</span>}
                </td>
                <td>
                  <ProgramBadge program={team.program} />
                </td>
                <td>{team.organization || "-"}</td>
                <td>{locationLine(team)}</td>
                <td>{team.grade ?? "-"}</td>
                <td>{team.registered ? "Registered" : "Inactive"}</td>
              </tr>
            ))}
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

function PageTitle({ icon, title, subtitle }: { icon: ReactNode; title: string; subtitle: string }) {
  return (
    <div className="page-title">
      <h1>
        {icon}
        {title}
      </h1>
      <p>{subtitle}</p>
    </div>
  );
}

function EventDetail({ id }: { id: string }) {
  const [tab, setTab] = useState("matches");
  const [selectedDivision, setSelectedDivision] = useState<number | null>(null);
  const { data: event, loading, error } = useAsync(() => api.event(id), [id]);
  const divisions = useMemo(() => [...(event?.divisions ?? [])].sort((a, b) => (a.order ?? a.id) - (b.order ?? b.id)), [event]);
  const division = selectedDivision ?? divisions[0]?.id ?? 1;
  const activeDivision = divisions.find((item) => item.id === division) ?? divisions[0];
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

  const eventAwards = awards.data?.data ?? [];
  const activeStatus = tab === "matches" ? matches : tab === "rankings" ? rankings : tab === "skills" ? skills : tab === "awards" ? awards : teams;
  const keyAwards = useMemo(() => {
    const priority = [
      /world champions|tournament champions|teamwork challenge world champions|event champions/i,
      /finalists/i,
      /excellence/i,
      /robot skills world champions|skills champions/i,
    ];

    return priority
      .map((pattern) => eventAwards.find((award) => pattern.test(award.title) && ((award.teamWinners?.length ?? 0) > 0 || (award.individualWinners?.length ?? 0) > 0)))
      .filter((award): award is Award => Boolean(award))
      .slice(0, 4);
  }, [eventAwards]);

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
            <span>{event.level ?? "Other"}</span>
          </div>
        </div>
        <FavoriteButton id={event.id} kind="event" />
      </div>

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          ["matches", "Matches", <Gamepad2 size={15} />],
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
      {(tab === "matches" || tab === "rankings") && activeDivision && (
        <div className="table-summary">
          Showing {activeDivision.name} division from RobotEvents.
        </div>
      )}
      {tab === "matches" && <MatchesTable matches={matches.data?.data ?? []} />}
      {tab === "rankings" && <RankingsTable rankings={rankings.data?.data ?? []} />}
      {tab === "skills" && <SkillsTable skills={skills.data?.data ?? []} />}
      {tab === "awards" && <AwardsList awards={awards.data?.data ?? []} />}
      {tab === "teams" && !teams.loading && teams.data && (
        <div className="table-summary">Showing 80 per page from {teams.data.data.length.toLocaleString()} RobotEvents teams.</div>
      )}
      {tab === "teams" && <TeamTable teams={teams.data?.data ?? []} loading={teams.loading} localPageSize={80} />}
    </section>
  );
}

function TeamDetail({ id }: { id: string }) {
  const [tab, setTab] = useState("events");
  const { data: team, loading, error } = useAsync(() => api.team(id), [id]);
  const events = useAsync(
    async () => {
      if (!team || tab !== "events") return null;
      return api.teamEvents(id, { per_page: 80 });
    },
    [id, team?.id, tab],
  );
  const matches = useAsync(
    async () => {
      if (!team || tab !== "matches") return null;
      return api.teamMatches(id, { per_page: 80 });
    },
    [id, team?.id, tab],
  );
  const rankings = useAsync(
    async () => {
      if (!team || tab !== "rankings") return null;
      return api.teamRankings(id, { per_page: 80 });
    },
    [id, team?.id, tab],
  );
  const skills = useAsync(
    async () => {
      if (!team || tab !== "skills") return null;
      return api.teamSkills(id, { per_page: 80 });
    },
    [id, team?.id, tab],
  );
  const awards = useAsync(
    async () => {
      if (!team || tab !== "awards") return null;
      return api.teamAwards(id, { per_page: 80 });
    },
    [id, team?.id, tab],
  );
  const activeStatus = tab === "events" ? events : tab === "matches" ? matches : tab === "rankings" ? rankings : tab === "skills" ? skills : awards;

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
          <h1>{team.team_name || `Team ${team.number}`}</h1>
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
          ["events", `Events ${events.data?.meta.total ?? ""}`, <CalendarDays size={15} />],
          ["matches", "Matches", <Gamepad2 size={15} />],
          ["rankings", "Rankings", <BarChart3 size={15} />],
          ["skills", "Skills", <Activity size={15} />],
          ["awards", "Awards", <AwardIcon size={15} />],
        ]}
      />
      <Status loading={activeStatus.loading} error={activeStatus.error} />
      {tab === "events" && <EventTable events={events.data?.data ?? []} loading={events.loading} />}
      {tab === "matches" && <MatchesTable matches={matches.data?.data ?? []} />}
      {tab === "rankings" && <RankingsTable rankings={rankings.data?.data ?? []} />}
      {tab === "skills" && <SkillsTable skills={skills.data?.data ?? []} />}
      {tab === "awards" && <AwardsList awards={awards.data?.data ?? []} />}
    </section>
  );
}

function EventHighlights({ awards }: { awards: Award[] }) {
  return (
    <div className="event-highlights">
      {awards.map((award) => (
        <article key={award.id}>
          <strong>{award.title}</strong>
          <div>
            {(award.teamWinners ?? []).map((winner) => (
              <TeamMiniLink key={`${award.id}-${winner.team.id}`} team={winner.team} />
            ))}
            {(award.individualWinners ?? []).map((winner) => (
              <span key={winner}>{winner}</span>
            ))}
          </div>
        </article>
      ))}
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

function MatchesTable({ matches }: { matches: Match[] }) {
  const [roundFilter, setRoundFilter] = useState("quals");
  const [page, setPage] = useState(1);
  const filteredMatches = matches.filter((match) => {
    if (roundFilter === "practice") return match.round === 1;
    if (roundFilter === "quals") return match.round === 2;
    if (roundFilter === "elims") return match.round >= 3;
    return true;
  });
  const pageSize = 50;
  const totalPages = Math.max(1, Math.ceil(filteredMatches.length / pageSize));
  const pageMatches = filteredMatches.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    setPage(1);
  }, [roundFilter, matches]);

  return (
    <Panel title="Matches" icon={<Gamepad2 />}>
      <div className="table-tools">
        {[
          ["all", "All"],
          ["quals", "Qualifications"],
          ["elims", "Eliminations"],
          ["practice", "Practice"],
        ].map(([value, label]) => (
            <button key={value} className={roundFilter === value ? "active" : ""} onClick={() => setRoundFilter(value)}>
              {label}
            </button>
          ))}
        <span>{filteredMatches.length.toLocaleString()} matches</span>
      </div>
      <table>
        <thead>
          <tr>
            <th>Match</th>
            <th>Red Alliance</th>
            <th>Blue Alliance</th>
            <th>Score</th>
            <th>Winner</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {pageMatches.map((match) => {
            const red = match.alliances.find((alliance) => alliance.color === "red");
            const blue = match.alliances.find((alliance) => alliance.color === "blue");
            const redScore = red?.score;
            const blueScore = blue?.score;
            const hasScore = redScore !== null && redScore !== undefined && blueScore !== null && blueScore !== undefined;
            const winner =
              !hasScore
                ? "-"
                : redScore === blueScore
                  ? "Tie"
                  : redScore > blueScore
                    ? "Red"
                    : "Blue";

            return (
              <tr key={match.id}>
                <td>
                  {match.name}
                  {match.field && <span className="muted inline-muted">Field {match.field}</span>}
                </td>
                <td className={winner === "Red" ? "winner-cell" : ""}>
                  <AllianceTeamLinks teams={red?.teams} />
                </td>
                <td className={winner === "Blue" ? "winner-cell" : ""}>
                  <AllianceTeamLinks teams={blue?.teams} />
                </td>
                <td>
                  <span className="score red">{red?.score ?? "-"}</span>
                  <span className="score blue">{blue?.score ?? "-"}</span>
                </td>
                <td>
                  <span className={`winner-badge ${winner.toLowerCase()}`}>{winner}</span>
                </td>
                <td>{hasScore || match.scored ? "Final" : match.scheduled ? formatShortDate(match.scheduled) : "Scheduled"}</td>
              </tr>
            );
          })}
          {!filteredMatches.length && (
            <tr>
              <td colSpan={6}>
                <Empty>No matches available for this view.</Empty>
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <LocalPager page={page} totalPages={totalPages} onPage={setPage} />
    </Panel>
  );
}

function RankingsTable({ rankings }: { rankings: Ranking[] }) {
  const [page, setPage] = useState(1);
  const sortedRankings = [...rankings].sort((a, b) => a.rank - b.rank);
  const pageSize = 80;
  const totalPages = Math.max(1, Math.ceil(sortedRankings.length / pageSize));
  const pageRows = sortedRankings.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    setPage(1);
  }, [rankings]);

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
          {pageRows.map((row) => (
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
      <LocalPager page={page} totalPages={totalPages} onPage={setPage} />
    </Panel>
  );
}

function SkillsTable({ skills }: { skills: Skill[] }) {
  const [page, setPage] = useState(1);
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
  const pageSize = 80;
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const pageRows = rows.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    setPage(1);
  }, [skills]);

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
          {pageRows.map((row) => {
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
      <LocalPager page={page} totalPages={totalPages} onPage={setPage} />
    </Panel>
  );
}

function AwardsList({ awards }: { awards: Award[] }) {
  return (
    <Panel title="Awards" icon={<Medal />}>
      <div className="award-list">
        {awards.map((award) => (
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
        {!awards.length && <Empty>No awards returned.</Empty>}
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
  return <Layout path={path}>{route(path)}</Layout>;
}
