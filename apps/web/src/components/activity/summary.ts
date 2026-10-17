import type { Dictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";
import { formatNumber, interpolate, plural } from "@/i18n/format";
import { formatSleep, type ActivityDay } from "@/lib/activity/activity";

/** One line for a day of the list: "8 000 шагов, 1 500 мл, сон 7:30"; null when nothing is shown. */
export function daySummary(
  t: Dictionary,
  locale: Locale,
  day: ActivityDay,
  shows: { steps: boolean; water: boolean } = { steps: true, water: true },
): string | null {
  const copy = t.activity;
  const parts = [
    shows.steps && day.steps ? plural(locale, day.steps.value, copy.steps.count) : null,
    shows.water && day.waterMl ? interpolate(copy.water.amount, { ml: formatNumber(locale, day.waterMl) }) : null,
    shows.steps && day.sleep ? interpolate(copy.sleep.short, { time: formatSleep(day.sleep.minutes) }) : null,
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}
