// Shared language resolution for the translation feature.
//
// This module is deliberately free of imports. The browser bundle uses it for
// the "does this string need translating" gate, and server/translate.ts imports
// it (`../src/lib/lang.js`) to build MyMemory's `langpair` — MyMemory does NOT
// auto-detect a source language, so the server needs exactly the same answer the
// client computed. Adding a dependency here would drag it across that boundary.
//
// The governing rule everywhere below: when in doubt, return null. A missed
// translation is a far cheaper failure than a mangled proper noun or a wasted
// request against a 5,000-word/day quota.

// --- script detection --------------------------------------------------------

// Kana is checked before Han because Japanese text is usually a mix of both;
// hangul likewise. Only text with no kana and no hangul is treated as Chinese.
const RE_KANA = /[぀-ヿ]/;
const RE_HANGUL = /[가-힯ᄀ-ᇿ㄰-㆏]/;
const RE_HAN = /[㐀-䶿一-鿿豈-﫿]/;
const RE_CYRILLIC = /[Ѐ-ӿ]/;
const RE_ARABIC = /[؀-ۿݐ-ݿ]/;
const RE_THAI = /[฀-๿]/;
const RE_GREEK = /[Ͱ-Ͽἀ-῿]/;
const RE_HEBREW = /[֐-׿]/;
const RE_DEVANAGARI = /[ऀ-ॿ]/;

const RE_LETTER = /\p{L}/u;
// A team number ("1234A") or SKU ("RE-V5RC-26-4244"): upper-case/digit tokens
// joined by hyphens, no spaces. The no-spaces requirement is what keeps a real
// all-caps name like "COLEGIO SAN JOSE" out of this bucket.
const RE_IDENTIFIER = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;

// --- country tables ----------------------------------------------------------

// RobotEvents returns `location.country` as a full English name, but a few
// endpoints and cached records carry an ISO-2 code instead, so both are keyed.
// Keys are upper-cased; look-ups normalise the same way.

const TRADITIONAL_HAN = new Set(["TAIWAN", "TW", "HONG KONG", "HK", "MACAU", "MACAO", "MO"]);

const CYRILLIC_BY_COUNTRY: Record<string, string> = {
  UKRAINE: "uk",
  UA: "uk",
  BULGARIA: "bg",
  BG: "bg",
  SERBIA: "sr",
  RS: "sr",
};

// Latin-script fallback. Countries absent from this table resolve to null, which
// covers both English-speaking countries and genuinely multi-language ones
// (Switzerland, Belgium, Canada, India, the Philippines, Kazakhstan) where a
// guess would be wrong as often as right.
const COUNTRY_LANG: Record<string, string> = {
  CHINA: "zh-CN", CN: "zh-CN",
  TAIWAN: "zh-TW", TW: "zh-TW",
  "HONG KONG": "zh-TW", HK: "zh-TW",
  MACAU: "zh-TW", MACAO: "zh-TW", MO: "zh-TW",
  JAPAN: "ja", JP: "ja",
  "KOREA, REPUBLIC OF": "ko", "SOUTH KOREA": "ko", KOREA: "ko", KR: "ko",
  MEXICO: "es", MX: "es",
  SPAIN: "es", ES: "es",
  COLOMBIA: "es", CO: "es",
  CHILE: "es", CL: "es",
  PERU: "es", PE: "es",
  ARGENTINA: "es", AR: "es",
  ECUADOR: "es", EC: "es",
  PANAMA: "es", PA: "es",
  "COSTA RICA": "es", CR: "es",
  "DOMINICAN REPUBLIC": "es", DO: "es",
  GUATEMALA: "es", GT: "es",
  "EL SALVADOR": "es", SV: "es",
  HONDURAS: "es", HN: "es",
  PARAGUAY: "es", PY: "es",
  URUGUAY: "es", UY: "es",
  BOLIVIA: "es", BO: "es",
  VENEZUELA: "es", VE: "es",
  NICARAGUA: "es", NI: "es",
  BRAZIL: "pt", BR: "pt",
  PORTUGAL: "pt", PT: "pt",
  FRANCE: "fr", FR: "fr",
  GERMANY: "de", DE: "de",
  AUSTRIA: "de", AT: "de",
  ITALY: "it", IT: "it",
  NETHERLANDS: "nl", NL: "nl",
  TURKEY: "tr", "TÜRKIYE": "tr", TR: "tr",
  POLAND: "pl", PL: "pl",
  "RUSSIAN FEDERATION": "ru", RUSSIA: "ru", RU: "ru",
  UKRAINE: "uk", UA: "uk",
  VIETNAM: "vi", "VIET NAM": "vi", VN: "vi",
  THAILAND: "th", TH: "th",
  INDONESIA: "id", ID: "id",
  MALAYSIA: "ms", MY: "ms",
  "SAUDI ARABIA": "ar", SA: "ar",
  "UNITED ARAB EMIRATES": "ar", AE: "ar",
  EGYPT: "ar", EG: "ar",
  QATAR: "ar", QA: "ar",
  KUWAIT: "ar", KW: "ar",
  BAHRAIN: "ar", BH: "ar",
  OMAN: "ar", OM: "ar",
  JORDAN: "ar", JO: "ar",
  LEBANON: "ar", LB: "ar",
  MOROCCO: "ar", MA: "ar",
  ISRAEL: "he", IL: "he",
  GREECE: "el", GR: "el",
  "CZECH REPUBLIC": "cs", CZECHIA: "cs", CZ: "cs",
  HUNGARY: "hu", HU: "hu",
  ROMANIA: "ro", RO: "ro",
  SWEDEN: "sv", SE: "sv",
  NORWAY: "no", NO: "no",
  DENMARK: "da", DK: "da",
  FINLAND: "fi", FI: "fi",
  ICELAND: "is", IS: "is",
  SLOVAKIA: "sk", SK: "sk",
  SLOVENIA: "sl", SI: "sl",
  CROATIA: "hr", HR: "hr",
  SERBIA: "sr", RS: "sr",
  BULGARIA: "bg", BG: "bg",
};

function normalizeCountry(country?: string | null): string {
  return (country ?? "").trim().toUpperCase();
}

/**
 * The MyMemory/Chrome source-language tag for this string, or null when we
 * cannot tell — which is also the instruction not to translate it.
 *
 * Script is checked first because it is unambiguous where it applies: Chinese
 * text is Chinese wherever the event is hosted. Only Latin-script text falls
 * back to the country, which is the sole signal available for Spanish, French,
 * Portuguese, German and Turkish names.
 */
export function resolveSourceLang(text: string, country?: string | null): string | null {
  if (!text) return null;
  const cc = normalizeCountry(country);

  if (RE_KANA.test(text)) return "ja";
  if (RE_HANGUL.test(text)) return "ko";
  if (RE_HAN.test(text)) return TRADITIONAL_HAN.has(cc) ? "zh-TW" : "zh-CN";
  if (RE_CYRILLIC.test(text)) return CYRILLIC_BY_COUNTRY[cc] ?? "ru";
  if (RE_ARABIC.test(text)) return "ar";
  if (RE_THAI.test(text)) return "th";
  if (RE_GREEK.test(text)) return "el";
  if (RE_HEBREW.test(text)) return "he";
  if (RE_DEVANAGARI.test(text)) return "hi";

  return COUNTRY_LANG[cc] ?? null;
}

/**
 * Whether this string is worth sending to a translation engine. Runs three cheap
 * rejections before the language lookup so that identifiers and punctuation never
 * cost a request.
 */
export function shouldTranslate(text: string | null | undefined, country?: string | null): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  if (trimmed.length < 2) return false;
  if (!RE_LETTER.test(trimmed)) return false;
  if (RE_IDENTIFIER.test(trimmed)) return false;
  return resolveSourceLang(trimmed, country) !== null;
}

/**
 * Cache key for a translation request. Shared by the client's in-memory and
 * localStorage caches and by the server's response map, so all three agree on
 * what identifies a translation. The same text under two source languages is two
 * different translations.
 */
export function translationKey(text: string, sourceLang: string): string {
  return `${sourceLang}\n${text}`;
}
