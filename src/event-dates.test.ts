import { describe, expect, it } from "vitest";

import {
  dayToNumber,
  daysUntilEventDay,
  eventDayNumber,
  eventDayParts,
  eventDayYear,
  formatEventDay,
  formatEventDayPadded,
  parseEventDay,
  todayInZone,
} from "./event-dates";

// The real payload for RE-V5RC-26-4244 (University of North Dakota Signature at the
// Mall of America, Bloomington MN). events.vex.com prints Aug 6-8; the API stamps
// midnight US Eastern, which is what used to render as Aug 5-7 for viewers west of
// Eastern.
const START = "2026-08-06T00:00:00-04:00";
const END = "2026-08-08T00:00:00-04:00";

describe("parseEventDay", () => {
  it("reads the event's own calendar date, not an instant", () => {
    expect(parseEventDay(START)).toEqual({ year: 2026, month: 8, day: 6 });
    expect(parseEventDay(END)).toEqual({ year: 2026, month: 8, day: 8 });
  });

  it("returns null for a missing or unparseable value", () => {
    expect(parseEventDay(null)).toBeNull();
    expect(parseEventDay("")).toBeNull();
    expect(parseEventDay("not a date")).toBeNull();
  });

  it("falls back to UTC components for a non-ISO timestamp", () => {
    // Same instant, no YYYY-MM-DD prefix to read.
    expect(parseEventDay("Thu, 06 Aug 2026 04:00:00 GMT")).toEqual({ year: 2026, month: 8, day: 6 });
  });
});

describe("formatting", () => {
  // These assertions hold in every timezone — that is the whole point. The suite
  // runs in the machine's zone, so a regression to viewer-local formatting fails
  // here for anyone not on US Eastern.
  it("formats the date the event is actually on", () => {
    expect(formatEventDay(START)).toBe("Aug 6, 2026");
    expect(formatEventDay(END)).toBe("Aug 8, 2026");
  });

  it("pads the day for the My Team timeline", () => {
    expect(formatEventDayPadded(START)).toBe("Aug 06, 2026");
  });

  it("falls back when there is no date", () => {
    expect(formatEventDay(null)).toBe("TBD");
    expect(formatEventDay(null, "—")).toBe("—");
    expect(formatEventDayPadded(null)).toBe("");
  });

  it("exposes the pieces a compact range is built from", () => {
    expect(eventDayParts(START)).toEqual({ mo: "Aug", day: "6", yr: "2026" });
    expect(eventDayParts(END)).toEqual({ mo: "Aug", day: "8", yr: "2026" });
  });

  it("keeps a New Year's Day event in its own year", () => {
    // Midnight Eastern on Jan 1 is Dec 31 in Pacific — the year must not slip.
    expect(eventDayYear("2027-01-01T00:00:00-05:00")).toBe(2027);
    expect(formatEventDay("2027-01-01T00:00:00-05:00")).toBe("Jan 1, 2027");
  });
});

describe("day numbers", () => {
  it("produces comparable integers", () => {
    expect(eventDayNumber(START)).toBe(20260806);
    expect(eventDayNumber(END)).toBe(20260808);
    expect(eventDayNumber(null)).toBeNull();
    expect(dayToNumber({ year: 2026, month: 8, day: 6 })).toBe(20260806);
  });
});

describe("todayInZone", () => {
  // 04:30 UTC on Aug 6 is still Aug 5 in Los Angeles and already Aug 6 in New York.
  const instant = new Date("2026-08-06T04:30:00Z");

  it("answers in the zone it is given", () => {
    expect(todayInZone("America/New_York", instant)).toEqual({ year: 2026, month: 8, day: 6 });
    expect(todayInZone("America/Los_Angeles", instant)).toEqual({ year: 2026, month: 8, day: 5 });
    expect(todayInZone("Asia/Shanghai", instant)).toEqual({ year: 2026, month: 8, day: 6 });
  });
});

describe("daysUntilEventDay", () => {
  // Midday UTC: Aug 6 across the whole US.
  const midday = new Date("2026-08-06T18:00:00Z");
  // 00:30 Aug 6 in Eastern, but still 23:30 Aug 5 in Central and 21:30 in Pacific.
  const easternJustTicked = new Date("2026-08-06T04:30:00Z");

  it("is 0 on the event's own day", () => {
    expect(daysUntilEventDay(START, "America/Chicago", midday)).toBe(0);
    expect(daysUntilEventDay(END, "America/Chicago", midday)).toBe(2);
  });

  it("counts whole days, never a fraction of the reader's clock", () => {
    expect(daysUntilEventDay("2026-08-09T00:00:00-04:00", "America/Chicago", midday)).toBe(3);
    expect(daysUntilEventDay("2026-08-03T00:00:00-04:00", "America/Chicago", midday)).toBe(-3);
  });

  it("answers in the event's zone, not the reader's", () => {
    // The distinction the app needs: this Minnesota event is "tomorrow" in Central
    // at this instant, even though Eastern has already rolled into Aug 6.
    expect(daysUntilEventDay(START, "America/New_York", easternJustTicked)).toBe(0);
    expect(daysUntilEventDay(START, "America/Chicago", easternJustTicked)).toBe(1);
    expect(daysUntilEventDay(START, "America/Los_Angeles", easternJustTicked)).toBe(1);
  });

  it("returns null without a date", () => {
    expect(daysUntilEventDay(null, "America/Chicago", midday)).toBeNull();
  });
});
