import { INTL_LOCALE, type Locale } from "./config";

/** Replaces {name} placeholders. Unknown placeholders stay as they are, so a missing value is visible. */
export function interpolate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (Object.hasOwn(values, key) ? String(values[key]) : match));
}

/** Plural forms by Intl.PluralRules category. Russian needs one/few/many, English one/other. */
export type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };

export function plural(locale: Locale, count: number, forms: PluralForms): string {
  const category = new Intl.PluralRules(INTL_LOCALE[locale]).select(count);
  return interpolate(forms[category] ?? forms.other, { count: formatNumber(locale, count) });
}

export function formatNumber(locale: Locale, value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale], options).format(value);
}

/** "Вторник, 13 октября" / "Tuesday, October 13": the date line under a screen title. */
export function formatLongDate(locale: Locale, date: Date, timeZone?: string): string {
  const text = new Intl.DateTimeFormat(INTL_LOCALE[locale], { weekday: "long", day: "numeric", month: "long", timeZone }).format(date);
  return text.charAt(0).toLocaleUpperCase(INTL_LOCALE[locale]) + text.slice(1);
}
