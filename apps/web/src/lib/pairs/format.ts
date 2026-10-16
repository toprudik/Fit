import { INTL_LOCALE, type Locale } from "@/i18n/config";

/** "чт, 15 окт., 18:30" / "Thu, Oct 15, 6:30 PM": a session start in the viewer's time zone. */
export function formatSessionTime(locale: Locale, iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(new Date(iso));
}

/** "3 марта 2026" / "March 3, 2026": a day such as the start of a pair. */
export function formatDay(locale: Locale, iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { day: "numeric", month: "long", year: "numeric", timeZone }).format(new Date(iso));
}

/** "15 окт., 18:30": when a note was written, without the weekday. */
export function formatNoteTime(locale: Locale, iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(new Date(iso));
}
