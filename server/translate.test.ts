import { describe, expect, it } from "vitest";
import { parseMyMemory } from "./translate.js";

const ok = (translatedText: string) => ({
  responseData: { translatedText, match: 0.85 },
  responseStatus: 200,
  quotaFinished: false,
});

describe("parseMyMemory", () => {
  it("returns the translated text on a clean success", () => {
    expect(parseMyMemory(ok("Beijing Robotics Competition"))).toBe("Beijing Robotics Competition");
  });

  it("trims surrounding whitespace", () => {
    expect(parseMyMemory(ok("  Beijing Robotics Competition  "))).toBe("Beijing Robotics Competition");
  });

  it("rejects a non-200 responseStatus", () => {
    expect(parseMyMemory({ ...ok("Anything"), responseStatus: 403 })).toBeNull();
  });

  it("rejects a string responseStatus, which the API sometimes sends", () => {
    expect(parseMyMemory({ ...ok("Anything"), responseStatus: "403" })).toBeNull();
  });

  it("rejects a finished quota", () => {
    expect(parseMyMemory({ ...ok("Anything"), quotaFinished: true })).toBeNull();
  });

  it("rejects empty or whitespace-only output", () => {
    expect(parseMyMemory(ok(""))).toBeNull();
    expect(parseMyMemory(ok("   "))).toBeNull();
  });

  it("rejects the API's error prose, which arrives with a 200 status", () => {
    expect(
      parseMyMemory(ok("MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY")),
    ).toBeNull();
    expect(parseMyMemory(ok("QUERY LENGTH LIMIT EXCEEDED. MAX ALLOWED QUERY : 500 CHARS"))).toBeNull();
    expect(parseMyMemory(ok("'AUTO' IS AN INVALID SOURCE LANGUAGE"))).toBeNull();
  });

  it("rejects a malformed payload instead of throwing", () => {
    expect(parseMyMemory(null)).toBeNull();
    expect(parseMyMemory({})).toBeNull();
    expect(parseMyMemory({ responseData: {} })).toBeNull();
    expect(parseMyMemory("not json at all")).toBeNull();
  });
});
