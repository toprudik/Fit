import { INTL_LOCALE, type Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { interpolate } from "@/i18n/format";
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
