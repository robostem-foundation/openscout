// ─────────────────────────────────────────────────────────────────────────────
// Team qualification mapping (award title + event level → qualification tier)
//
// RobotEvents exposes no reliable, machine-typed "this award qualifies the team
// to level X" field (the `Award.qualifications` string array is inconsistent and
// free-form), so the mapping lives here as a maintained static rule table.
//
// Rules are deliberately CONSERVATIVE: many berths are conditional (spots roll
// down, region-dependent, capacity-limited), so we under-badge when uncertain
// rather than tell a team they're qualified when they aren't. Everything here is
// "based on typical REC/RECF criteria — verify with the official rules." Keep the
// rules centralized so they're easy to update per season/program.
// ─────────────────────────────────────────────────────────────────────────────

import type { Award, Event } from "./types";

// Where a given award qualifies a team to, roughly ordered by prestige.
export type QualTier = "Worlds" | "Signature" | "Championship";

// The event "level" bucket a qualification rule cares about. Mirrors the buckets
// used by `eventCategory` in App.tsx but kept independent so this module stays
// self-contained.
type EventLevel = "Worlds" | "Signature" | "Championship" | "Other";

export type QualRule = {
  // Regex tested against the award title.
  titlePattern: RegExp;
  // Event levels this rule applies to (award earned at an event of this level).
  levels: EventLevel[];
  // What the award qualifies the team to.
  qualifiesTo: QualTier;
  // Human-readable "via …" clause, e.g. "Signature Champion".
  via: string;
};

// Ordering used to de-duplicate to the highest tier a team holds.
const TIER_RANK: Record<QualTier, number> = {
  Worlds: 0,
  Signature: 1,
  Championship: 2,
};

function eventLevel(event?: Event | null): EventLevel {
  const raw = event?.level ?? event?.event_type ?? "";
  if (raw === "World") return "Worlds";
  if (raw === "Signature") return "Signature";
  if (raw === "National" || raw === "State" || raw === "Regional") return "Championship";
  return "Other";
}

// The rule table. Each rule matches (award title, event level) → qualification.
// Conservative on purpose: only the finishes that most reliably grant a berth
// under typical criteria are listed; ambiguous awards are intentionally omitted.
const QUAL_RULES: QualRule[] = [
  // ── Worlds berths ──
  // Excellence at a Signature or Championship event is the classic Worlds path.
  { titlePattern: /excellence/i, levels: ["Signature", "Championship"], qualifiesTo: "Worlds", via: "Excellence Award" },
  // Tournament / Event / Teamwork Champions at a Signature event → Worlds
  // (Signature events are Worlds-qualifying).
  { titlePattern: /tournament champions|event champions|teamwork (challenge )?champions|world champions/i, levels: ["Signature"], qualifiesTo: "Worlds", via: "Signature Champion" },
  // Top finishes at a Regional/State/National Championship → Worlds.
  { titlePattern: /tournament champions|event champions|teamwork (challenge )?champions/i, levels: ["Championship"], qualifiesTo: "Worlds", via: "Championship Champion" },
  // Robot Skills Champion at a Signature / Championship → Worlds via skills.
  { titlePattern: /robot skills champions|skills champions/i, levels: ["Signature", "Championship"], qualifiesTo: "Worlds", via: "Skills Champion" },

  // ── Signature berths ──
  // Excellence at a local/regional (Other) event is most reliably a path toward a
  // Signature or regional championship rather than a direct Worlds berth —
  // under-badge to Signature.
  { titlePattern: /excellence/i, levels: ["Other"], qualifiesTo: "Signature", via: "Excellence Award" },

  // ── Regional / State Championship berths ──
  // Tournament Champion / Skills Champion at a qualifying (Other) tournament most
  // typically qualifies to the next level up: the region's championship.
  { titlePattern: /tournament champions|event champions|teamwork (challenge )?champions/i, levels: ["Other"], qualifiesTo: "Championship", via: "Tournament Champion" },
  { titlePattern: /robot skills champions|skills champions/i, levels: ["Other"], qualifiesTo: "Championship", via: "Skills Champion" },
];

export type AwardQualification = {
  qualifiesTo: QualTier;
  via: string;
  label: string; // e.g. "Worlds (via Signature Champion)"
};

// Return the qualification a single award grants at its event, or null. When
// several rules match, keep the highest tier (lowest rank).
export function awardQualification(award: Award, event?: Event | null): AwardQualification | null {
  const level = eventLevel(event);
  let best: QualRule | null = null;
  for (const rule of QUAL_RULES) {
    if (!rule.levels.includes(level)) continue;
    if (!rule.titlePattern.test(award.title)) continue;
    if (!best || TIER_RANK[rule.qualifiesTo] < TIER_RANK[best.qualifiesTo]) best = rule;
  }
  if (!best) return null;
  return { qualifiesTo: best.qualifiesTo, via: best.via, label: `${best.qualifiesTo} (via ${best.via})` };
}

export type TeamQualification = {
  qualifiesTo: QualTier;
  // The distinct paths that earned this tier, e.g. multiple events.
  paths: Array<{ via: string; eventName: string; eventId: number }>;
};

// Evaluate all of a team's awards through the rules and return the qualifications
// held, de-duplicated to the highest tier. Each tier lists the distinct paths
// (award + event) that earned it.
export function teamQualifications(awards: Award[], eventIndex: Map<number, Event>): TeamQualification[] {
  const byTier = new Map<QualTier, TeamQualification>();
  for (const award of awards) {
    const event = eventIndex.get(award.event.id);
    const qual = awardQualification(award, event);
    if (!qual) continue;
    const existing = byTier.get(qual.qualifiesTo);
    const path = { via: qual.via, eventName: event?.name ?? "Unknown event", eventId: award.event.id };
    if (existing) {
      // Avoid duplicate (via + event) rows.
      if (!existing.paths.some((p) => p.via === path.via && p.eventId === path.eventId)) existing.paths.push(path);
    } else {
      byTier.set(qual.qualifiesTo, { qualifiesTo: qual.qualifiesTo, paths: [path] });
    }
  }
  return [...byTier.values()].sort((a, b) => TIER_RANK[a.qualifiesTo] - TIER_RANK[b.qualifiesTo]);
}
