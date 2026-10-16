/**
 * Calendar days and wall times in the trainer's zone (PRD §2.6.7). Days are "YYYY-MM-DD" strings, so they
 * never pick up the server's zone; instants are Date. The database keeps the same rules in local_to_utc.
 */

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real calendar day as "YYYY-MM-DD", or null. */
export function parseDay(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = DAY.exec(value);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toISOString().slice(0, 10) === value ? value : null;
}

/** The day n days after (or before) a day. */
export function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** 1 = Monday … 7 = Sunday, as ISO counts them. */
export function isoWeekday(day: string): number {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

/** The Monday of the day's week. */
export function weekStart(day: string): string {
  return addDays(day, 1 - isoWeekday(day));
}

/** The seven days of the week starting on that Monday. */
export function weekDays(monday: string): string[] {
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

/** The calendar day and minutes since midnight of an instant in a zone. */
export function localParts(instant: Date | string, timeZone: string): { day: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(typeof instant === "string" ? new Date(instant) : instant);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return { day: `${part("year")}-${part("month")}-${part("day")}`, minutes: Number(part("hour")) * 60 + Number(part("minute")) };
}

/** Today in a zone. */
export function today(timeZone: string): string {
  return localParts(new Date(), timeZone).day;
}

function offsetMinutes(instant: number, timeZone: string): number {
  const { day, minutes } = localParts(new Date(instant), timeZone);
  const asUtc = Date.parse(`${day}T00:00:00Z`) + minutes * 60_000;
  return Math.round((asUtc - Math.floor(instant / 60_000) * 60_000) / 60_000);
}

/**
 * A wall time (day plus minutes since midnight) in a zone as an instant. A time in a daylight saving gap
 * lands after the gap and an ambiguous one on the first reading, close to local_to_utc in the database;
 * the app uses it only for day boundaries and form defaults.
 */
export function localToUtc(day: string, minutes: number, timeZone: string): Date {
  const wall = Date.parse(`${day}T00:00:00Z`) + minutes * 60_000;
  const first = wall - offsetMinutes(wall, timeZone) * 60_000;
  return new Date(wall - offsetMinutes(first, timeZone) * 60_000);
}

/** "09:05" from minutes since midnight. */
export function formatMinutes(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** Minutes since midnight from "09:05", or null. */
export function parseMinutes(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = /^([01]\d|2[0-3]):([0-5]\d)(?::00)?$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}
