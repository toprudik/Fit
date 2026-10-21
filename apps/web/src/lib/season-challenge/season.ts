import { INTL_LOCALE, type Locale } from "@/i18n/config";

/** A season challenge's title, 3 to 80 characters as the database checks. */
export const SEASON_TITLE_MIN = 3;
export const SEASON_TITLE_MAX = 80;

/** "2027-01" from a month field, or "2027-01-01", to the first day the database stores; null when it isn't one. */
export function monthStart(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(0[1-9]|1[0-2])(?:-01)?$/.exec(value.trim());
  return match ? `${match[1]}-${match[2]}-01` : null;
}

/** "январь 2027" for the first day of a month. */
export function monthLabel(locale: Locale, month: string): string {
  const [year, number] = month.split("-").map(Number);
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { month: "long", year: "numeric", timeZone: "UTC" })
    .formatToParts(new Date(Date.UTC(year, number - 1, 1)))
    .filter((part) => part.type === "month" || part.type === "year")
    .map((part) => part.value)
    .join(" ");
}

export type SeasonChallenge = {
  id: string;
  title: string;
  month: string;
  joined: boolean;
  finished: boolean;
  result: "done" | "missed" | null;
  attended: number;
  missed: number;
  ahead: number;
};

/** The row my_season_challenge answered, or null when there is none or it is malformed. */
export function seasonChallengeFrom(rows: unknown): SeasonChallenge | null {
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  if (typeof r.id !== "string" || typeof r.title !== "string" || !monthStart(r.month)) return null;
  const count = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
  return {
    id: r.id,
    title: r.title,
    month: monthStart(r.month)!,
    joined: r.joined === true,
    finished: r.finished === true,
    result: r.result === "done" || r.result === "missed" ? r.result : null,
    attended: count(r.attended),
    missed: count(r.missed),
    ahead: count(r.ahead),
  };
}
