import { INTL_LOCALE, type Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { interpolate, plural } from "@/i18n/format";
import { formatAmount, formatDuration, fromKg, type WeightUnit } from "./units";

export type SetValues = { reps: number | null; weightKg: number | null; durationS: number | null };

/** One set as read on a log or a hint: "10 × 40 кг", "12 повторов", "40 кг · 1:30", "1:30". */
export function formatSet(t: Dictionary, locale: Locale, set: SetValues, unit: WeightUnit): string {
  const copy = t.workouts.sets;
  const weight = set.weightKg !== null && set.weightKg > 0 ? formatAmount(locale, fromKg(set.weightKg, unit)) : null;
  const parts: string[] = [];
  if (set.reps !== null && weight !== null) parts.push(interpolate(copy.repsWeight, { reps: set.reps, weight, unit: copy.units[unit] }));
  else if (set.reps !== null) parts.push(plural(locale, set.reps, copy.reps));
  else if (weight !== null) parts.push(interpolate(copy.weight, { weight, unit: copy.units[unit] }));
  if (set.durationS !== null) parts.push(formatDuration(set.durationS));
  return parts.join(" · ");
}

/** A record value in the viewer's unit: a weight, a number of reps or a time. */
export function formatRecord(
  t: Dictionary,
  locale: Locale,
  record: { type: "max_weight" | "max_reps" | "max_duration"; value: number },
  unit: WeightUnit,
): string {
  if (record.type === "max_weight") return formatSet(t, locale, { reps: null, weightKg: record.value, durationS: null }, unit);
  if (record.type === "max_reps") return plural(locale, record.value, t.workouts.sets.reps);
  return formatDuration(record.value);
}

/** A log's local date as "пт, 16 окт." / "Fri, Oct 16", with the year when it is not `thisYear`. */
export function formatLogDay(locale: Locale, day: string, thisYear: number = new Date().getFullYear()): string {
  const [year, month, date] = day.split("-").map(Number);
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: year === thisYear ? undefined : "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, date)));
}
