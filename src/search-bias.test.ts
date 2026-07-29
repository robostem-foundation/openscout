import { beforeEach, describe, expect, it, vi } from "vitest";

const robotEventsTeams = vi.fn();
vi.mock("./api", () => ({ api: { robotEventsTeams: (...args: unknown[]) => robotEventsTeams(...args) } }));

const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => void store.set(key, value),
  removeItem: (key: string) => void store.delete(key),
});

const { clearSearchBias, readSearchBias, syncSearchBias, toGradeCode } = await import("./search-bias");

const teamsResponse = (grade: string | null) => ({ data: [{ id: 1, number: "2982X", grade }] });

beforeEach(() => {
  store.clear();
  robotEventsTeams.mockReset();
  clearSearchBias();
  // Reset the in-flight lookup key so each test starts able to fetch again.
  syncSearchBias(null, null);
});

describe("toGradeCode", () => {
  it("maps the RobotEvents grade strings", () => {
    expect(toGradeCode("High School")).toBe("HS");
    expect(toGradeCode("Middle School")).toBe("MS");
    expect(toGradeCode("Elementary School")).toBe("ES");
    expect(toGradeCode("College")).toBe("U");
  });

  it("returns null for anything unrecognised", () => {
    expect(toGradeCode(null)).toBeNull();
    expect(toGradeCode("")).toBeNull();
    expect(toGradeCode("Grade 7")).toBeNull();
  });
});

describe("syncSearchBias", () => {
  it("clears the bias when no team is set", () => {
    syncSearchBias(null, null);
    expect(readSearchBias()).toEqual({ programId: null, gradeCode: null });
    expect(robotEventsTeams).not.toHaveBeenCalled();
  });

  it("clears the bias when the program is set but the number is blank", () => {
    syncSearchBias("1", "   ");
    expect(readSearchBias().programId).toBeNull();
    expect(robotEventsTeams).not.toHaveBeenCalled();
  });

  it("publishes the program before the grade lookup resolves", async () => {
    robotEventsTeams.mockResolvedValue(teamsResponse("High School"));
    syncSearchBias("1", "2982X");
    expect(readSearchBias()).toEqual({ programId: 1, gradeCode: null });

    await vi.waitFor(() => expect(readSearchBias().gradeCode).toBe("HS"));
    expect(robotEventsTeams).toHaveBeenCalledWith({ number: "2982X", "program[]": [1], per_page: 5 });
  });

  it("caches the resolved grade so a later session skips the lookup", async () => {
    robotEventsTeams.mockResolvedValue(teamsResponse("Middle School"));
    syncSearchBias("41", "2982x");
    await vi.waitFor(() => expect(readSearchBias().gradeCode).toBe("MS"));

    clearSearchBias();
    syncSearchBias(null, null);
    robotEventsTeams.mockClear();
    syncSearchBias("41", "2982X"); // same team, different case
    expect(readSearchBias()).toEqual({ programId: 41, gradeCode: "MS" });
    expect(robotEventsTeams).not.toHaveBeenCalled();
  });

  it("never looks up a program whose grade is unambiguous", () => {
    syncSearchBias("4", "2982X"); // VURC is University-only
    expect(readSearchBias()).toEqual({ programId: 4, gradeCode: "U" });
    expect(robotEventsTeams).not.toHaveBeenCalled();
  });

  it("keeps the program-only bias when the lookup fails", async () => {
    robotEventsTeams.mockRejectedValue(new Error("rate limited"));
    syncSearchBias("1", "2982X");
    await vi.waitFor(() => expect(robotEventsTeams).toHaveBeenCalled());
    expect(readSearchBias()).toEqual({ programId: 1, gradeCode: null });
  });

  it("keeps the program-only bias when the team row carries no grade", async () => {
    robotEventsTeams.mockResolvedValue(teamsResponse(null));
    syncSearchBias("1", "2982X");
    await vi.waitFor(() => expect(robotEventsTeams).toHaveBeenCalled());
    expect(readSearchBias()).toEqual({ programId: 1, gradeCode: null });
    expect(store.size).toBe(0);
  });
});
