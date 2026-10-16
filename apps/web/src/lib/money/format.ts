import type { Locale } from "@/i18n/config";

/**
 * Money is stored in minor units with an ISO currency (ADR 0008, MONEY-3). Every currency DaFit offers
 * (lib/trainer-wizard/options CURRENCIES) has two decimals, so 1 major unit = 100 minor units.
 */
export const MINOR_PER_MAJOR = 100;

/** Highest price a trainer can type, in major units. */
export const MAX_PRICE_MAJOR = 10_000_000;

/** "1 500 ₽" from minor units, in the viewer's language; kopecks only when there are any. */
export function formatMoney(locale: Locale, minor: number, currency: string): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: minor % MINOR_PER_MAJOR === 0 ? 0 : 2 }).format(
    minor / MINOR_PER_MAJOR,
  );
}

/** "₽" for RUB in the viewer's language, shown after a price field. */
export function currencySymbol(locale: Locale, currency: string): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).formatToParts(0).find((part) => part.type === "currency")?.value ?? currency;
}

/**
 * A price typed in major units ("1 500", "1500,50") as minor units, or null when it is not a price:
 * empty, negative, more than two decimals or above MAX_PRICE_MAJOR.
 */
export function parseMajor(text: string): number | null {
  const cleaned = text.replace(/[\s  ]/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value > MAX_PRICE_MAJOR) return null;
  return Math.round(value * MINOR_PER_MAJOR);
}

/** Minor units as the plain number a price field shows: "1500", "1500.5". */
export function majorText(minor: number): string {
  return String(minor / MINOR_PER_MAJOR);
}
