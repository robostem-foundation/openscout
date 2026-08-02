import { describe, expect, it } from "vitest";
import { compareMeta, eventMeta, formatDateRange, fullTitle, metaForPath, teamMeta } from "./page-meta";

describe("formatDateRange", () => {
  it("collapses a same-month range", () => {
    expect(formatDateRange("2025-11-14T08:00:00-08:00", "2025-11-16T18:00:00-08:00")).toBe("Nov 14 to 16, 2025");
  });

  it("keeps both months when the range crosses one", () => {
    expect(formatDateRange("2025-10-31", "2025-11-02")).toBe("Oct 31 to Nov 2, 2025");
  });

  it("prints a single day once", () => {
    expect(formatDateRange("2025-11-14", "2025-11-14")).toBe("Nov 14, 2025");
  });

  it("reads the calendar day off the string, not the local timezone", () => {
    // 2025-11-14T00:30 in a +13 zone is Nov 13 in UTC; the venue's day is Nov 14.
    expect(formatDateRange("2025-11-14T00:30:00+13:00")).toBe("Nov 14, 2025");
  });

  it("returns nothing for a missing or unparseable date", () => {
    expect(formatDateRange(null)).toBe("");
    expect(formatDateRange("someday")).toBe("");
  });

  it("ignores the stripped epoch date on old RobotEvents rows", () => {
    expect(formatDateRange("1970-01-01T00:00:00-05:00", "1970-01-01T00:00:00-05:00")).toBe("");
  });
});

describe("eventMeta", () => {
  const event = {
    name: "Blue Alliance Signature Event",
    sku: "RE-V5RC-24-1234",
    start: "2025-11-14",
    end: "2025-11-16",
    level: "Signature Event",
    program: { code: "V5RC" },
    location: { city: "Cupertino", region: "California" },
  };

  it("describes the event without repeating the title", () => {
    const meta = eventMeta(event);
    expect(meta.title).toBe("Blue Alliance Signature Event");
    expect(meta.description).toBe(
      "V5RC Signature Event in Cupertino, California on Nov 14 to 16, 2025. Rankings, brackets, skills, and match results on OpenScout.",
    );
  });

  it("drops the fragments it has no data for", () => {
    const meta = eventMeta({ name: "Some Event" });
    expect(meta.description).toBe("event. Rankings, brackets, skills, and match results on OpenScout.");
  });

  it("says 'event' rather than the placeholder level 'Other'", () => {
    const meta = eventMeta({ ...event, level: "Other", start: "1970-01-01", end: "1970-01-01" });
    expect(meta.description).toBe(
      "V5RC event in Cupertino, California. Rankings, brackets, skills, and match results on OpenScout.",
    );
  });

  it("falls back to the SKU when the event has no name", () => {
    expect(eventMeta({ sku: "RE-V5RC-24-1234" }).title).toBe("RE-V5RC-24-1234");
  });
});

describe("teamMeta", () => {
  it("puts the team name in the title and the origin in the description", () => {
    const meta = teamMeta({
      number: "1698V",
      team_name: "Skyrise",
      grade: "High School",
      program: { code: "V5RC" },
      location: { city: "Sunnyvale", region: "California" },
    });
    expect(meta.title).toBe("1698V Skyrise");
    expect(meta.description).toBe(
      "1698V is a V5RC high school team from Sunnyvale, California. Season records, skills scores, awards, and match video on OpenScout.",
    );
  });

  it("survives a team with nothing but a number", () => {
    const meta = teamMeta({ number: "229V" });
    expect(meta.title).toBe("229V");
    expect(meta.description).toBe("229V is a team. Season records, skills scores, awards, and match video on OpenScout.");
  });
});

describe("metaForPath", () => {
  it("serves the static table", () => {
    expect(metaForPath("/events").title).toBe("Events");
    expect(metaForPath("/skills?program=1#top").title).toBe("World Skills");
    expect(metaForPath("/events/").title).toBe("Events");
  });

  it("keeps private routes out of search results", () => {
    expect(metaForPath("/settings").noindex).toBe(true);
    expect(metaForPath("/join/6f1d2b3a-0000-4000-8000-abcdefabcdef").noindex).toBe(true);
    expect(metaForPath("/my-team/6f1d2b3a-0000-4000-8000-abcdefabcdef").noindex).toBe(true);
  });

  it("uses the identifier as a placeholder on entity routes", () => {
    expect(metaForPath("/events/re-v5rc-24-1234").title).toBe("RE-V5RC-24-1234");
    expect(metaForPath("/teams/1698v").title).toBe("1698V");
    expect(metaForPath("/teams/v5rc/1698v").title).toBe("1698V");
  });

  it("names both teams on a compare link", () => {
    expect(metaForPath("/compare/1698v/229v").title).toBe("1698V vs 229V");
    expect(compareMeta(["1698V", "229V"]).description).toContain("comparison of 1698V and 229V");
  });

  it("falls through to a noindex 404", () => {
    expect(metaForPath("/nope").noindex).toBe(true);
  });
});

describe("fullTitle", () => {
  it("suffixes the site name once", () => {
    expect(fullTitle("Events")).toBe("Events | OpenScout");
    expect(fullTitle("Events | OpenScout")).toBe("Events | OpenScout");
    expect(fullTitle("OpenScout: scouting and analytics for VEX Robotics")).toBe(
      "OpenScout: scouting and analytics for VEX Robotics",
    );
  });
});
