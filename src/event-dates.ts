// Event dates are calendar days, not instants.
//
// RobotEvents stamps every event's start/end at midnight US Eastern regardless of
// where on earth the event is: a Minnesota event reads
// "2026-08-06T00:00:00-04:00", and so does one in Xinjiang. Sampling the API, the
// time component was 00:00:00-04:00 on every single row. So the timestamp carries
// exactly one fact — the leading YYYY-MM-DD, which is the event's own local date
// and the date events.vex.com prints — and the time-of-day is noise.
//
// Handing that string to `new Date()` and formatting it in the viewer's timezone
// therefore shifts the whole event a day earlier for everyone west of Eastern
// (midnight Eastern is 21:00 the previous day in Pacific). Every date here is
// instead read from the string's own components and formatted in the event's local
// terms, so an event runs Aug 6-8 for a viewer in Bloomington, Los Angeles, London
// and Shanghai alike.
//
// Day-boundary questions ("is it on today?") additionally need a *zone* to know
// when today is: that comes from the event's coordinates (see eventTimeZone in
// App.tsx) so the answer follows the event's local day, not the reader's.

/** A calendar day with a 1-12 month, as recorded for an event. */
export type EventDay = { year: number; month: number; day: number };

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})/;

/**
 * The event's own calendar date. Reads the leading YYYY-MM-DD rather than
 * converting an instant, which is what keeps it stable across viewer timezones.
 */
export function parseEventDay(value?: string | null): EventDay | null {
  const match = ISO_DAY.exec(value ?? "");
  if (match) return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };

  // Not the shape we expect: fall back to the UTC components, which at least stay
  // the same for every viewer instead of drifting by timezone.
  const date = new Date(value ?? NaN);
  if (Number.isNaN(date.getTime())) return null;
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

/**
 * Midday UTC on that calendar day. Midday, not midnight, so that formatting or
 * comparing it can never land on the wrong side of a day boundary; and UTC so the
 * value is the same instant everywhere. Only ever paired with `timeZone: "UTC"`
 * formatters and with other values from this function.
 */
export function eventDayToUtcNoon(day: EventDay): Date {
  return new Date(Date.UTC(day.year, day.month - 1, day.day, 12));
}

/** Midday-UTC timestamp for an event date string, or null when it has none. */
export function eventDayMs(value?: string | null): number | null {
  const day = parseEventDay(value);
  return day ? eventDayToUtcNoon(day).getTime() : null;
}

/** Sortable/comparable integer for a calendar day, e.g. 20260806. */
export function dayToNumber(day: EventDay): number {
  return day.year * 10000 + day.month * 100 + day.day;
}

export function eventDayNumber(value?: string | null): number | null {
  const day = parseEventDay(value);
  return day ? dayToNumber(day) : null;
}

/** The calendar year the event falls in — from its own date, not the viewer's. */
export function eventDayYear(value?: string | null): number | null {
  return parseEventDay(value)?.year ?? null;
}

const DAY_KEY_FORMAT: Intl.DateTimeFormatOptions = { year: "numeric", month: "2-digit", day: "2-digit" };

/**
 * Today's calendar day in the given zone (the event's), or in the viewer's zone
 * when the event has no coordinates to resolve one from. en-CA formats as
 * YYYY-MM-DD, which parseEventDay reads directly.
 */
export function todayInZone(timeZone?: string | null, now = new Date()): EventDay {
  const formatted = new Intl.DateTimeFormat("en-CA", timeZone ? { ...DAY_KEY_FORMAT, timeZone } : DAY_KEY_FORMAT).format(now);
  return (
    parseEventDay(formatted) ?? { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() }
  );
}

// --- formatting --------------------------------------------------------------

// All of these format a midday-UTC anchor in UTC, so what comes out is the
// calendar date the API recorded, in every viewer's timezone.
const utcFormatter = (options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" });

const LONG_DAY = utcFormatter({ month: "short", day: "numeric", year: "numeric" });
const PADDED_DAY = utcFormatter({ month: "short", day: "2-digit", year: "numeric" });

/** "Aug 6, 2026", or "TBD" when the event has no date. */
export function formatEventDay(value?: string | null, fallback = "TBD"): string {
  const day = parseEventDay(value);
  return day ? LONG_DAY.format(eventDayToUtcNoon(day)) : fallback;
}

/** "Aug 06, 2026" — the zero-padded variant the My Team timeline uses. */
export function formatEventDayPadded(value?: string | null, fallback = ""): string {
  const day = parseEventDay(value);
  return day ? PADDED_DAY.format(eventDayToUtcNoon(day)) : fallback;
}

/** The month / day / year pieces of an event date, for building compact ranges. */
export function eventDayParts(value?: string | null): { mo: string; day: string; yr: string } | null {
  const day = parseEventDay(value);
  if (!day) return null;
  const parts = LONG_DAY.formatToParts(eventDayToUtcNoon(day));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return { mo: get("month"), day: get("day"), yr: get("year") };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whole days from today to the event's date — 0 on the day itself, negative once
 * it is past. Both ends are calendar days (today taken in `timeZone`, the event's
 * own zone when known), so "in 3 days" never drifts by the reader's clock.
 */
export function daysUntilEventDay(value?: string | null, timeZone?: string | null, now = new Date()): number | null {
  const target = eventDayMs(value);
  if (target == null) return null;
  return Math.round((target - eventDayToUtcNoon(todayInZone(timeZone, now)).getTime()) / DAY_MS);
}
