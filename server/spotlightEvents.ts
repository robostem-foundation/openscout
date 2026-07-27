// Identifies VEX "Spotlight Event" tier events.
//
// Why this needs its own lookup: RobotEvents' API reports Spotlight events with
// `level: "World"` — the same value real World Championships get. The 2026-2027
// Lobstah Bowl (RE-V5RC-26-4596) is level "World" while the 2025-2026 edition of
// the same event was level "Signature", so nothing in the /events payload
// separates a Spotlight event from Worlds. The public event page doesn't either:
// its structured "Event Type" field reads "Open Tournament", and the word
// Spotlight appears only in the event's name and prose description.
//
// The one authoritative, structured marker is the program listing's "Level Class"
// filter, which enumerates the tiers as ids — 3 = World Championship,
// 9 = Signature Event, 21 = Spotlight Event. Filtering the listing by
// `level_class_id=21` returns exactly the Spotlight events for a season, so this
// module reads that list and hands back their SKUs. No name or description
// parsing is involved.

import { fetchVexPage } from "./eventGrades.js";

const EVENTS_VEX_BASE = process.env.ROBOTEVENTS_ROOT_BASE ?? "https://events.vex.com";

// "Level Class" option id for Spotlight Event on the events.vex.com filter form.
const SPOTLIGHT_LEVEL_CLASS_ID = 21;

// Programs that run the tier, with their listing slug. The tier is new in
// 2026-2027 and V5RC/VIQRC are the only programs offering it; VURC/VAIRC are left
// out rather than spending a request on a listing that is always empty.
const LISTING_SLUGS: Record<number, string> = {
  1: "vex-robotics-competition",
  41: "vex-iq-competition",
};

// A listing page holds 25 rows. Spotlight events number in the single digits per
// season, so this cap only exists so a layout change can't spin the loop.
const MAX_PAGES = 3;

function listingUrl(slug: string, seasonId: number, page: number) {
  const params = new URLSearchParams({
    level_class_id: String(SPOTLIGHT_LEVEL_CLASS_ID),
    seasonId: String(seasonId),
  });
  if (page > 1) params.set("page", String(page));
  return `${EVENTS_VEX_BASE}/robot-competitions/${slug}?${params}`;
}

// Every event row links to `…/RE-V5RC-26-4596.html`, so the SKUs are the event
// links on the page.
const SKU_LINK = /\/(RE-[A-Z0-9]+-\d\d-\d+)\.html/gi;

function skusOnPage(html: string): string[] {
  return [...html.matchAll(SKU_LINK)].map((match) => match[1].toUpperCase());
}

async function skusForProgramSeason(programId: number, seasonId: number): Promise<string[]> {
  const slug = LISTING_SLUGS[programId];
  if (!slug) return [];
  const found = new Set<string>();
  for (let page = 1; page <= MAX_PAGES; page++) {
    const html = await fetchVexPage(listingUrl(slug, seasonId, page), `spotlight listing ${slug} p${page}`);
    const skus = skusOnPage(html);
    const before = found.size;
    skus.forEach((sku) => found.add(sku));
    // Stop as soon as a page adds nothing — either it was the last one or the
    // listing ignored the page param and repeated itself.
    if (found.size === before) break;
    if (!/[?&]page=\d+/.test(html)) break;
  }
  return [...found];
}

export type SpotlightEventsResult = { skus: string[]; seasons: number[] };

// Level class never changes for an event, but new events keep appearing, so this
// is a refresh interval rather than a permanent cache.
const TTL_MS = 12 * 60 * 60 * 1000;
let cache: { at: number; result: SpotlightEventsResult } | null = null;

/**
 * SKUs of every Spotlight-tier event in the given seasons, cache-first.
 *
 * `seasons` is a list of `[programId, seasonId]` pairs — the caller resolves
 * which seasons matter (see api/spotlight-events.ts) so this module stays a
 * pure listing reader. A program whose listing fails is skipped: the client then
 * shows that event with its RobotEvents level, which is the pre-existing
 * behaviour, and the next request retries.
 */
export async function resolveSpotlightEvents(
  seasons: Array<{ programId: number; seasonId: number }>,
): Promise<SpotlightEventsResult> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.result;

  const skus = new Set<string>();
  const covered: number[] = [];
  await Promise.all(
    seasons.map(async ({ programId, seasonId }) => {
      try {
        (await skusForProgramSeason(programId, seasonId)).forEach((sku) => skus.add(sku));
        covered.push(seasonId);
      } catch (err) {
        console.error("[spotlight-events]", err instanceof Error ? err.message : err);
      }
    }),
  );

  const result: SpotlightEventsResult = { skus: [...skus].sort(), seasons: covered.sort((a, b) => a - b) };
  // Only cache a run that resolved something; a total failure should retry.
  if (covered.length) cache = { at: Date.now(), result };
  return result;
}
