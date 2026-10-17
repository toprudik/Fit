import { INTL_LOCALE, type Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { interpolate, plural } from "@/i18n/format";
import { formatSet } from "@/lib/workouts/present";
import type { TemplateItem } from "@/lib/workouts/template";
import { weightUnit } from "@/lib/workouts/units";
import type { Homework } from "./homework";

/** "18 октября" for a day of the client: the date as written, with no time zone shift. */
export function formatHomeworkDay(locale: Locale, day: string): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));
}

/** "Срок 18 октября", or "Пн, Ср, Пт до 15 ноября" for a repeat. */
export function homeworkSchedule(t: Dictionary, locale: Locale, homework: Pick<Homework, "dueDate" | "repeatWeekdays" | "repeatUntil">): string {
  const copy = t.homework;
  if (!homework.repeatWeekdays || !homework.repeatUntil) {
    return interpolate(copy.due, { date: formatHomeworkDay(locale, homework.dueDate) });
  }
  const days = t.schedule.sessionForm.weekdaysShort;
  return interpolate(copy.repeat, {
    days: homework.repeatWeekdays.map((d) => days[String(d) as keyof typeof days]).join(", "),
    date: formatHomeworkDay(locale, homework.repeatUntil),
  });
}

/**
 * A template item as a homework prescription: "3 × 10 × 40 кг", "3 × 1:00", or what of it the template set.
 * Empty when the template gave no targets.
 */
export function prescriptionFromTemplate(t: Dictionary, locale: Locale, item: TemplateItem): string {
  const set = formatSet(t, locale, { reps: item.targetReps, weightKg: item.targetWeightKg, durationS: item.targetDurationS }, weightUnit(locale));
  if (item.targetSets === null) return set;
  return set ? `${item.targetSets} × ${set}` : plural(locale, item.targetSets, t.homework.form.sets);
}
