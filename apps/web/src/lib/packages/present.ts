import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { interpolate, plural } from "@/i18n/format";
import { formatMoney } from "@/lib/money/format";

/** One line of the grid as clients see it, already in the viewer's language. */
export type PriceGridItem = {
  key: string;
  title: string;
  price: string;
  /** "1 600 ₽ за занятие"; null for the drop-in, whose price is per session already. */
  perSession: string | null;
  /** "выгода 20 %", or null when nothing is saved. */
  savings: string | null;
  best: boolean;
  /** "90 дней", or null without expiry. */
  validity: string | null;
};

export type PriceGridSource = {
  key: string;
  title: string;
  sessionsCount: number;
  priceMinor: number;
  currency: string;
  perSessionMinor: number;
  savingsPct: number | null;
  isBestValue: boolean;
  validityDays: number | null;
};

export function priceGridItems(rows: readonly PriceGridSource[], t: Dictionary, locale: Locale): PriceGridItem[] {
  const copy = t.money.packages;
  return rows.map((row) => ({
    key: row.key,
    title: row.title,
    price: formatMoney(locale, row.priceMinor, row.currency),
    perSession: row.sessionsCount > 1 ? interpolate(copy.grid.perSession, { price: formatMoney(locale, row.perSessionMinor, row.currency) }) : null,
    savings: row.savingsPct ? interpolate(copy.grid.savings, { pct: row.savingsPct }) : null,
    best: row.isBestValue,
    validity: row.validityDays ? plural(locale, row.validityDays, copy.validity.days) : null,
  }));
}

/** "Разовое занятие" or "10 занятий" in the given language: the name of a package left unnamed. */
export function packageTitle(t: Dictionary, locale: Locale, sessions: number): string {
  return sessions === 1 ? t.money.packages.titles.dropIn : plural(locale, sessions, t.money.packages.titles.pack);
}
