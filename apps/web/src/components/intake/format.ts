import { INTL_LOCALE, type Locale } from "@/i18n/config";

/** "16 октября 2026 г." / "October 16, 2026": when a version of the intake was sent. */
export function formatIntakeDate(locale: Locale, iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { day: "numeric", month: "long", year: "numeric", timeZone }).format(new Date(iso));
}
