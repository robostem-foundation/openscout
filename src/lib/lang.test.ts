import { describe, expect, it } from "vitest";
import { resolveSourceLang, shouldTranslate, translationKey } from "./lang";

describe("resolveSourceLang — script wins over country", () => {
  it("detects Japanese from kana even when Han is also present", () => {
    expect(resolveSourceLang("東京ロボット大会", "Japan")).toBe("ja");
  });

  it("detects Korean from hangul", () => {
    expect(resolveSourceLang("서울 로봇 대회", "Korea, Republic of")).toBe("ko");
  });

  it("treats bare Han as Simplified by default", () => {
    expect(resolveSourceLang("北京机器人大赛", "China")).toBe("zh-CN");
  });

  it("treats bare Han as Traditional in Taiwan, Hong Kong and Macau", () => {
    expect(resolveSourceLang("台北機器人大賽", "Taiwan")).toBe("zh-TW");
    expect(resolveSourceLang("香港機器人大賽", "Hong Kong")).toBe("zh-TW");
  });

  it("defaults Cyrillic to Russian but honors a more specific country", () => {
    expect(resolveSourceLang("Кубок роботов", "Russian Federation")).toBe("ru");
    expect(resolveSourceLang("Кубок роботів", "Ukraine")).toBe("uk");
  });

  it("detects the remaining scripts", () => {
    expect(resolveSourceLang("بطولة الروبوت", "Egypt")).toBe("ar");
    expect(resolveSourceLang("การแข่งขันหุ่นยนต์", "Thailand")).toBe("th");
    expect(resolveSourceLang("Διαγωνισμός ρομπότ", "Greece")).toBe("el");
    expect(resolveSourceLang("תחרות רובוטים", "Israel")).toBe("he");
    expect(resolveSourceLang("रोबोट प्रतियोगिता", "India")).toBe("hi");
  });

  it("trusts script even when the country disagrees", () => {
    // A Chinese-named event hosted in the US is still Chinese text.
    expect(resolveSourceLang("上海邀请赛", "United States")).toBe("zh-CN");
  });
});

describe("resolveSourceLang — Latin script falls back to country", () => {
  it("maps non-English countries to their language", () => {
    expect(resolveSourceLang("Torneo de Robótica", "Mexico")).toBe("es");
    expect(resolveSourceLang("Torneio de Robótica", "Brazil")).toBe("pt");
    expect(resolveSourceLang("Tournoi de Robotique", "France")).toBe("fr");
    expect(resolveSourceLang("Roboter Wettbewerb", "Germany")).toBe("de");
    expect(resolveSourceLang("Robot Turnuvası", "Turkey")).toBe("tr");
  });

  it("accepts ISO-2 country codes as well as full names", () => {
    expect(resolveSourceLang("Torneo de Robótica", "MX")).toBe("es");
  });

  it("returns null for English-speaking countries", () => {
    expect(resolveSourceLang("Spring Qualifier", "United States")).toBeNull();
    expect(resolveSourceLang("Spring Qualifier", "Canada")).toBeNull();
  });

  it("returns null for multi-language countries rather than guessing", () => {
    expect(resolveSourceLang("Robot Cup", "Switzerland")).toBeNull();
    expect(resolveSourceLang("Robot Cup", "Belgium")).toBeNull();
  });

  it("returns null when there is no country to fall back on", () => {
    expect(resolveSourceLang("Torneo de Robótica", null)).toBeNull();
    expect(resolveSourceLang("Torneo de Robótica", undefined)).toBeNull();
    expect(resolveSourceLang("Torneo de Robótica", "")).toBeNull();
  });

  it("returns null for an unrecognized country", () => {
    expect(resolveSourceLang("Robot Cup", "Atlantis")).toBeNull();
  });
});

describe("shouldTranslate", () => {
  it("is true when a source language resolves", () => {
    expect(shouldTranslate("北京机器人大赛", "China")).toBe(true);
  });

  it("is false for empty, whitespace, and single-character input", () => {
    expect(shouldTranslate("", "China")).toBe(false);
    expect(shouldTranslate("   ", "China")).toBe(false);
    expect(shouldTranslate("中", "China")).toBe(false);
    expect(shouldTranslate(null, "China")).toBe(false);
    expect(shouldTranslate(undefined, "China")).toBe(false);
  });

  it("is false for strings with no letters at all", () => {
    expect(shouldTranslate("2026 — ???", "China")).toBe(false);
    expect(shouldTranslate("1234", "China")).toBe(false);
  });

  it("is false for identifiers: team numbers and SKUs", () => {
    expect(shouldTranslate("1234A", "China")).toBe(false);
    expect(shouldTranslate("RE-V5RC-26-4244", "China")).toBe(false);
  });

  it("is true for an all-caps multi-word name, which is not an identifier", () => {
    expect(shouldTranslate("COLEGIO SAN JOSE", "Mexico")).toBe(true);
  });

  it("is false when the source language is unresolvable", () => {
    expect(shouldTranslate("Spring Qualifier", "United States")).toBe(false);
  });
});

describe("translationKey", () => {
  it("joins language and text with a newline", () => {
    expect(translationKey("北京", "zh-CN")).toBe("zh-CN\n北京");
  });

  it("distinguishes the same text under different source languages", () => {
    expect(translationKey("Robot", "es")).not.toBe(translationKey("Robot", "pt"));
  });
});
