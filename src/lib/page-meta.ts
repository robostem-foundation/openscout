// Per-page title/description copy, shared by the client (which swaps
// document.title on navigation) and the server (which bakes the same strings
// into the HTML shell so link previews and crawlers see them).
//
// This module is deliberately dependency-free and DOM-free: it is type-checked
// by both tsconfig.app (browser) and tsconfig.node (server/api), so it may not
// reach for `document`, React, or anything in src/types.ts.

export const SITE_NAME = "OpenScout";
export const SITE_URL = "https://openscout.ing";

export type SiteMeta = {
  title: string;
  description: string;
  /** Keep the page out of search results (private or per-user pages). */
  noindex?: boolean;
};

export const DEFAULT_META: SiteMeta = {
  title: "OpenScout: scouting and analytics for VEX Robotics",
  description:
    "Live brackets, rankings, team records, world skills standings, and match video for every VEX Robotics event.",
};

// Routes with no dynamic segment. Everything not listed here either matches one
// of the entity patterns below or falls through to notFoundMeta().
const STATIC_META: Record<string, SiteMeta> = {
  "/": DEFAULT_META,
  "/events": {
    title: "Events",
    description:
      "Browse VEX Robotics events by date, region, and program. Rankings, brackets, skills, and match results for every event on the calendar.",
  },
  "/teams": {
    title: "Teams",
    description:
      "Search VEX Robotics teams by number, name, or region. Season records, skills scores, award history, and head to head comparison.",
  },
  "/skills": {
    title: "World Skills",
    description:
      "Live VEX Robotics world skills standings. Driver and programming scores ranked by combined total, across every program and grade level.",
  },
  "/insights": {
    title: "Insights",
    description:
      "Season wide VEX Robotics trends. Score distributions, regional strength, and how skills scores move through the year.",
  },
  "/jumper": {
    title: "Jumper",
    description:
      "Match video finder for VEX Robotics. Jump straight to any match on an event livestream recording.",
  },
  "/my-team": {
    title: "My Team",
    description:
      "Your team's scouting workspace on OpenScout. Notes, picklists, and favorites shared with everyone on the team.",
    noindex: true,
  },
  "/settings": {
    title: "Settings",
    description: "Theme, language, units, and account preferences for OpenScout.",
    noindex: true,
  },
  "/terms": {
    title: "Terms",
    description: "The terms of service for using OpenScout.",
  },
  "/privacy": {
    title: "Privacy",
    description: "What OpenScout collects, what it does not, and how your scouting data is stored.",
  },
};

/** Structural subsets of src/types.ts, redeclared so this file stays import-free. */
export type MetaLocation = { city?: string | null; region?: string | null; country?: string | null };
export type MetaEvent = {
  name?: string | null;
  sku?: string | null;
  start?: string | null;
  end?: string | null;
  level?: string | null;
  event_type?: string | null;
  program?: { code?: string | null; name?: string | null } | null;
  location?: MetaLocation | null;
};
export type MetaTeam = {
  number?: string | null;
  team_name?: string | null;
  organization?: string | null;
  grade?: string | null;
  program?: { code?: string | null; name?: string | null } | null;
  location?: MetaLocation | null;
};

/** "Events" becomes "Events | OpenScout"; the bare site name is left alone. */
export function fullTitle(title: string): string {
  return title === SITE_NAME || title.endsWith(`| ${SITE_NAME}`) || title.startsWith(`${SITE_NAME}:`)
    ? title
    : `${title} | ${SITE_NAME}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// RobotEvents dates are ISO strings whose date part is already local to the
// venue, so read the calendar fields off the string instead of via Date (which
// would shift the day for anyone west of UTC).
function datePart(value?: string | null): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? "");
  if (!match) return null;
  const m = Number(match[2]);
  if (m < 1 || m > 12) return null;
  return { y: Number(match[1]), m, d: Number(match[3]) };
}

/**
 * "Nov 14 to 16, 2025", "Oct 31 to Nov 2, 2025", or "Nov 14, 2025".
 *
 * Old RobotEvents rows carry a stripped epoch date (1970-01-01) instead of a
 * real one, so anything before VEX existed is treated as no date at all.
 */
export function formatDateRange(start?: string | null, end?: string | null): string {
  const a = datePart(start);
  if (!a || a.y < 2000) return "";
  const b = datePart(end);
  const head = `${MONTHS[a.m - 1]} ${a.d}`;
  if (!b || (a.y === b.y && a.m === b.m && a.d === b.d)) return `${head}, ${a.y}`;
  if (a.y === b.y && a.m === b.m) return `${head} to ${b.d}, ${a.y}`;
  if (a.y === b.y) return `${head} to ${MONTHS[b.m - 1]} ${b.d}, ${a.y}`;
  return `${head}, ${a.y} to ${MONTHS[b.m - 1]} ${b.d}, ${b.y}`;
}

/** "Cupertino, CA", falling back to whichever half exists. */
export function formatPlace(location?: MetaLocation | null): string {
  const parts = [location?.city, location?.region].map((p) => (p ?? "").trim()).filter(Boolean);
  if (parts.length) return parts.join(", ");
  return (location?.country ?? "").trim();
}

// Builds one sentence from fragments, dropping the empty ones so a missing
// venue or date never leaves "in , on" behind, and terminating it with a stop.
function sentence(parts: Array<string | false | null | undefined>): string {
  const body = parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  return body ? `${body.replace(/[.]+$/, "")}.` : "";
}

export function eventMeta(event: MetaEvent): SiteMeta {
  const name = (event.name ?? "").trim() || (event.sku ?? "").trim() || "Event";
  const program = (event.program?.code ?? "").trim();
  // `level` is "Signature Event", "Regional", "World", or the placeholder
  // "Other", which reads as a typo in a sentence.
  const level = (event.level ?? event.event_type ?? "").trim();
  const kind = !level || /^other$/i.test(level) ? "event" : level;
  const place = formatPlace(event.location);
  const dates = formatDateRange(event.start, event.end);
  const lead = sentence([program, kind, place && `in ${place}`, dates && `on ${dates}`]);
  return {
    title: name,
    description: `${lead} Rankings, brackets, skills, and match results on OpenScout.`.trim(),
  };
}

export function teamMeta(team: MetaTeam): SiteMeta {
  const number = (team.number ?? "").trim() || "Team";
  const name = (team.team_name ?? "").trim();
  const program = (team.program?.code ?? "").trim();
  const grade = (team.grade ?? "").trim().toLowerCase();
  const place = formatPlace(team.location);
  const lead = sentence([`${number} is a`, program, grade, "team", place && `from ${place}`]);
  return {
    title: name ? `${number} ${name}` : number,
    description: `${lead} Season records, skills scores, awards, and match video on OpenScout.`.trim(),
  };
}

export function compareMeta(numbers: string[]): SiteMeta {
  const list = numbers.filter(Boolean);
  if (!list.length) return { title: "Compare teams", description: "Compare VEX Robotics teams side by side on OpenScout." };
  const joined = list.length === 1 ? list[0] : `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
  return {
    title: list.join(" vs "),
    description: `Side by side comparison of ${joined}. Records, skills scores, awards, and shared event history on OpenScout.`,
  };
}

export function joinMeta(): SiteMeta {
  return {
    title: "Join a shared team",
    description:
      "You have been invited to a shared scouting team on OpenScout. Notes, picklists, and favorites shared with everyone on the team.",
    noindex: true,
  };
}

export function sharedTeamMeta(): SiteMeta {
  return {
    title: "Shared Team",
    description: "A shared scouting workspace on OpenScout.",
    noindex: true,
  };
}

export function notFoundMeta(): SiteMeta {
  return {
    title: "Page not found",
    description: "That page does not exist on OpenScout.",
    noindex: true,
  };
}

/** Strip query and hash, and normalise away a trailing slash. */
export function normalisePath(path: string): string {
  const bare = path.split("?")[0].split("#")[0];
  return bare.length > 1 ? bare.replace(/\/+$/, "") : bare;
}

/**
 * The meta a route can produce without any upstream data. Entity routes return
 * a placeholder (the SKU or team number) that the client refines once the page
 * loads and the server replaces outright after its own fetch.
 */
export function metaForPath(path: string): SiteMeta {
  const p = normalisePath(path);
  const known = STATIC_META[p];
  if (known) return known;

  const compare = /^\/compare\/(.+)$/.exec(p);
  if (compare) {
    return compareMeta(
      compare[1]
        .split("/")
        .map((part) => safeDecode(part).trim().toUpperCase())
        .filter(Boolean)
        .slice(0, 3),
    );
  }
  if (/^\/join\/[0-9a-f-]+$/i.test(p)) return joinMeta();
  if (/^\/(my-team|shared-team|org)\/[0-9a-f-]+/i.test(p)) return sharedTeamMeta();

  const event = /^\/events?\/(.+)$/.exec(p);
  if (event) return { title: safeDecode(event[1]).toUpperCase(), description: DEFAULT_META.description };

  const team = /^\/teams?\/(.+)$/.exec(p);
  if (team) {
    const segments = team[1].split("/").filter(Boolean).map(safeDecode);
    return { title: (segments[segments.length - 1] ?? "").toUpperCase(), description: DEFAULT_META.description };
  }

  return notFoundMeta();
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
