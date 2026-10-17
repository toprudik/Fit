import { INTL_LOCALE, type Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { interpolate, plural } from "@/i18n/format";
import type { ChallengeMetric } from "./challenges";

/** "19 октября" / "October 19" from a "YYYY-MM-DD" day. */
export function challengeDay(locale: Locale, day: string): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));
}

/** "с 19 октября по 1 ноября". */
export function challengePeriod(copy: Dictionary["challenges"], locale: Locale, startsOn: string, endsOn: string): string {
  return interpolate(copy.period, { from: challengeDay(locale, startsOn), to: challengeDay(locale, endsOn) });
}

/** "12 400 шагов", "5 тренировок". */
export function challengeScore(copy: Dictionary["challenges"], locale: Locale, metric: ChallengeMetric, score: number): string {
  return plural(locale, score, copy.units[metric]);
}

/** The Monday after a day ("YYYY-MM-DD"); a Monday gives the next one. */
export function nextMonday(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  const weekday = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() + (weekday === 1 ? 7 : (8 - weekday) % 7));
  return date.toISOString().slice(0, 10);
}
