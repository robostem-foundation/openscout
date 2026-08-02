// Resolves a request path into the meta the HTML shell should carry.
//
// Static routes come straight from the shared table. Event and team pages cost
// exactly one upstream call each, so a link preview stays cheap; if that call
// fails or is slow the route still ships its placeholder meta (the SKU or team
// number) rather than blocking the response.

import {
  DEFAULT_META,
  eventMeta,
  metaForPath,
  normalisePath,
  teamMeta,
  type MetaEvent,
  type MetaTeam,
  type SiteMeta,
} from "../src/lib/page-meta.js";
import { proxyRequest } from "./proxy.js";

// The VEX programs the app covers, matching vexProgramIds in src/App.tsx. Team
// numbers are only unique within a program, so a bare /teams/1698V resolves to
// whichever of these the API returns first, same as the client does.
const VEX_PROGRAM_IDS = [1, 4, 41, 57];

// A scraper that waits is a scraper that renders no preview at all, so cap the
// upstream call well under the usual crawler patience.
const UPSTREAM_TIMEOUT_MS = 2500;

async function withTimeout<T>(work: Promise<T>, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), UPSTREAM_TIMEOUT_MS);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function robotEvents<T>(endpoint: string, query: string): Promise<T | null> {
  try {
    const result = await proxyRequest("re", endpoint, query);
    if (result.status < 200 || result.status >= 300) return null;
    return JSON.parse(result.body) as T;
  } catch {
    return null;
  }
}

function firstOf<T>(payload: { data?: T[] } | null): T | null {
  return payload?.data?.[0] ?? null;
}

const allDigits = (value: string) => /^\d+$/.test(value);

async function lookupEvent(param: string): Promise<MetaEvent | null> {
  if (allDigits(param)) return robotEvents<MetaEvent>(`events/${param}`, "");
  const query = `?sku%5B%5D=${encodeURIComponent(param)}&per_page=1`;
  return firstOf(await robotEvents<{ data: MetaEvent[] }>("events", query));
}

async function lookupTeam(param: string): Promise<MetaTeam | null> {
  // Either "/teams/1698V" or the program-qualified "/teams/v5rc/1698V".
  const parts = param.split("/").filter(Boolean).map(safeDecode);
  const numberOrId = parts[parts.length - 1] ?? "";
  if (!numberOrId) return null;
  if (parts.length === 1 && allDigits(numberOrId)) return robotEvents<MetaTeam>(`teams/${numberOrId}`, "");
  const programs = VEX_PROGRAM_IDS.map((id) => `program%5B%5D=${id}`).join("&");
  const query = `?number%5B%5D=${encodeURIComponent(numberOrId.toUpperCase())}&${programs}&per_page=1`;
  return firstOf(await robotEvents<{ data: MetaTeam[] }>("teams", query));
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export type ResolvedMeta = SiteMeta & {
  /** Seconds the CDN may serve this shell for. Entity pages are cached longer. */
  sMaxAge: number;
};

export async function resolveMetaForPath(path: string): Promise<ResolvedMeta> {
  const p = normalisePath(path);
  const placeholder = metaForPath(p);

  const eventMatch = /^\/events?\/(.+)$/.exec(p);
  if (eventMatch) {
    const event = await withTimeout(lookupEvent(safeDecode(eventMatch[1])), null);
    if (!event) return { ...placeholder, description: DEFAULT_META.description, sMaxAge: 60 };
    return { ...eventMeta(event), sMaxAge: 3600 };
  }

  const teamMatch = /^\/teams?\/(.+)$/.exec(p);
  if (teamMatch) {
    const team = await withTimeout(lookupTeam(teamMatch[1]), null);
    if (!team) return { ...placeholder, description: DEFAULT_META.description, sMaxAge: 60 };
    return { ...teamMeta(team), sMaxAge: 3600 };
  }

  // Static and no-fetch routes: the copy only changes when this repo does.
  return { ...placeholder, sMaxAge: 86400 };
}
