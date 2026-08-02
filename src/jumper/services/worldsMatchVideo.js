// Worlds match → BoxCast broadcast resolution.
//
// Worlds streams on BoxCast, not YouTube, so it never appears in the Jumper
// admin's Edge Config presets and `/api/jumper/match-timestamp` returns nothing
// for it. This module is the BoxCast-side equivalent: given a RobotEvents event
// plus its matches, it produces the same `MatchTimestamp` shape the YouTube path
// returns, with a `boxcast` field instead of a `videoId`.
//
// The algorithm mirrors handleJumpToMatch() on the Jumper Worlds page:
//   1. Map the event to a WORLDS_CONFIG program-year (BoxCast channel + division names)
//   2. Fetch + group the channel's broadcasts into "DivisionName-DayN" buckets
//   3. Per match: division name + day index → broadcast
//   4. seek = (match start − broadcast start) − the division's calibration preset

import { WORLDS_CONFIG } from '../data/worldsConfig';
import { fetchChannelBroadcasts, groupBroadcasts, resolveBroadcast } from './boxcast';
import { getWorldsSyncPresetOffset } from './worldsSyncOffsets';
import { getMatchDayIndex, inferMatchDayFromContext } from '../utils/streamMatching';

// RobotEvents program codes per Worlds program family. V5RC HS/MS share codes
// (and so do VIQRC ES/MS) — the grade keyword and division roster break the tie.
const PROGRAM_CODES = {
    'V5RC HS': ['VRC', 'V5RC'],
    'V5RC MS': ['VRC', 'V5RC'],
    VURC: ['VURC', 'VEXU'],
    'VIQRC ES': ['VIQRC', 'VIQC'],
    'VIQRC MS': ['VIQRC', 'VIQC'],
};

const PROGRAM_GRADE_KEYWORD = {
    'V5RC HS': 'high school',
    'V5RC MS': 'middle school',
    'VIQRC ES': 'elementary',
    'VIQRC MS': 'middle school',
};

// A match whose `started` is wildly far from its `scheduled` is a data glitch —
// trust the schedule instead. Same window the Worlds page uses.
const MATCH_TIME_SANITY_WINDOW_MS = 30 * 60 * 1000;

function effectiveMatchTime(match) {
    const started = match?.started;
    const scheduled = match?.scheduled;
    if (started && scheduled) {
        const diff = Math.abs(new Date(started).getTime() - new Date(scheduled).getTime());
        return diff > MATCH_TIME_SANITY_WINDOW_MS ? scheduled : started;
    }
    return started || scheduled || null;
}

function dayIndexFor(match, allMatches, eventStartDate) {
    const matchTime = effectiveMatchTime(match);
    if (matchTime && eventStartDate) return getMatchDayIndex(matchTime, eventStartDate);
    return inferMatchDayFromContext(match, allMatches, eventStartDate);
}

// ---------------------------------------------------------------------------
// Program-year resolution
//
// The `sku` field in WORLDS_CONFIG is only filled in for a couple of entries, so
// a SKU hit is a fast path rather than the requirement. Everything else is
// scored: division roster overlap dominates (it is the most specific signal),
// then the grade keyword in the event name, then the config's date window.
// ---------------------------------------------------------------------------
export function resolveWorldsProgram(event) {
    if (!event?.start) return null;

    for (const [year, programs] of Object.entries(WORLDS_CONFIG)) {
        for (const [program, config] of Object.entries(programs)) {
            if (config.sku && config.sku === event.sku) return { program, year, config };
        }
    }

    // Beyond the SKU pins, only ever infer for genuine world-championship events.
    if ((event.level ?? '').toLowerCase() !== 'world') return null;
    const name = (event.name ?? '').toLowerCase();
    if (!name.includes('world') || name.includes('scrimmage')) return null;

    const year = String(new Date(event.start).getFullYear());
    const programs = WORLDS_CONFIG[year];
    if (!programs) return null;

    const code = (event.program?.code ?? '').toUpperCase();
    const eventDivisions = (event.divisions ?? []).map((d) => (d.name ?? '').toLowerCase());

    let best = null;
    for (const [program, config] of Object.entries(programs)) {
        if (!(PROGRAM_CODES[program] ?? []).includes(code)) continue;

        const overlap = config.divisions.filter((div) =>
            eventDivisions.some((reName) => reName.includes(div.toLowerCase())),
        ).length;
        const gradeKeyword = PROGRAM_GRADE_KEYWORD[program];
        const gradeHit = gradeKeyword ? name.includes(gradeKeyword) : false;
        const dateHit = overlapsConfigWindow(event, config);

        // A candidate that shares no divisions with the event is the wrong
        // program-year, however well its name or dates read.
        if (!overlap) continue;

        const score = overlap * 10 + (gradeHit ? 5 : 0) + (dateHit ? 3 : 0);
        if (!best || score > best.score) best = { program, year, config, score };
    }

    return best ? { program: best.program, year: best.year, config: best.config } : null;
}

function overlapsConfigWindow(event, config) {
    if (!config.eventStart || !config.eventEnd) return false;
    const start = new Date(event.start).getTime();
    const end = new Date(event.end ?? event.start).getTime();
    const cfgStart = new Date(`${config.eventStart}T00:00:00Z`).getTime();
    const cfgEnd = new Date(`${config.eventEnd}T23:59:59Z`).getTime();
    return start <= cfgEnd && end >= cfgStart;
}

// RobotEvents names divisions "Innovate", BoxCast titles them "… (Innovate)", and
// WORLDS_CONFIG lists the bare name — this is the bridge between the three.
export function worldsDivisionName(event, resolved, divisionId) {
    if (!resolved || divisionId == null) return null;
    const division = (event?.divisions ?? []).find((d) => d.id === divisionId);
    if (!division) return null;
    const reName = (division.name ?? '').toLowerCase();
    return resolved.config.divisions.find((div) => reName.includes(div.toLowerCase())) ?? null;
}

// ---------------------------------------------------------------------------
// Broadcast fetch (shared across the event page, team event cards and My Team,
// which all mount their own copy of the hook for the same channel).
// ---------------------------------------------------------------------------
const broadcastCache = new Map();

function loadBroadcasts(channelId, year, divisionNames) {
    const key = `${channelId}::${year}`;
    let pending = broadcastCache.get(key);
    if (!pending) {
        pending = fetchChannelBroadcasts(channelId, year)
            .then((raw) => groupBroadcasts(raw, divisionNames))
            .catch((error) => {
                broadcastCache.delete(key); // let the next mount retry
                throw error;
            });
        broadcastCache.set(key, pending);
    }
    return pending;
}

// ---------------------------------------------------------------------------
// Timestamps
// ---------------------------------------------------------------------------
export async function worldsMatchTimestamps(event, matches, resolved) {
    if (!resolved || !matches?.length) return [];
    const { program, year, config } = resolved;

    const grouped = await loadBroadcasts(config.channelId, year, config.divisions);
    const eventStartDate = event?.start || config.eventStart || null;
    const now = Date.now();

    // RobotEvents division id → the WORLDS_CONFIG division name BoxCast titles use.
    const divisionNameById = new Map();
    for (const division of event?.divisions ?? []) {
        const configName = worldsDivisionName(event, resolved, division.id);
        if (configName) divisionNameById.set(division.id, configName);
    }

    const out = [];
    for (const match of matches) {
        const divisionId = match.division?.id ?? 1;
        const divisionName = divisionNameById.get(divisionId);
        if (!divisionName) continue;

        const matchTime = effectiveMatchTime(match);
        // Nothing to seek to for a match that has not happened yet.
        if (!matchTime || new Date(matchTime).getTime() > now) continue;

        const dayIdx = dayIndexFor(match, matches, eventStartDate);
        const broadcast = resolveBroadcast(grouped, divisionName, dayIdx, config.broadcastOverrides);
        if (!broadcast?.id || !broadcast.starts_at) continue;

        const base = Math.max(
            0,
            Math.floor((new Date(matchTime).getTime() - new Date(broadcast.starts_at).getTime()) / 1000),
        );
        // Hand-measured per-division calibration; 0 where a division has not been
        // calibrated yet, which is how the Jumper Worlds page behaves too.
        const offset = getWorldsSyncPresetOffset({ program, year, divisionName, dayIdx });

        out.push({
            id: match.id,
            name: match.name,
            divisionId,
            timestamp: Math.max(0, base - offset),
            livestreamLink: `https://boxcast.tv/view/${broadcast.id}`,
            videoId: null,
            boxcast: { broadcastId: broadcast.id, channelId: config.channelId },
        });
    }

    return out;
}
