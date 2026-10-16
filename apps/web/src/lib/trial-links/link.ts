import type { Locale } from "@/i18n/config";
import { isClientLinkToken } from "@/lib/client-links/link";

/**
 * Trial links (PRD wave-1 §2.3 rule 4, screens.md §1.7): the landing /trial/<token>, opened by the
 * web address and in the Mini App by startapp=tl_<token>. The token is the same 22-character kind the
 * database makes for client links.
 */
export const TRIAL_START_PREFIX = "tl_";

/** Lengths offered when making a link; the database allows 15–240 minutes. */
export const TRIAL_DURATIONS = [30, 45, 60, 90] as const;

/** Highest price a trainer can type, in major units. */
export const TRIAL_MAX_PRICE = 1_000_000;

export function isTrialToken(value: string | null | undefined): value is string {
  return isClientLinkToken(value);
}

export function trialPath(token: string): string {
  return `/trial/${token}`;
}

/** The web address to copy and share. */
export function trialUrl(token: string, appUrl: string): string {
  return new URL(trialPath(token), appUrl).toString();
}

/** The Mini App link that opens the landing in Telegram. */
export function trialTelegram(token: string, botUsername: string): string {
  return `https://t.me/${botUsername}?startapp=${TRIAL_START_PREFIX}${token}`;
}

/** "1 500 ₽" from minor units; every currency we offer has two decimals. */
export function formatTrialPrice(locale: Locale, priceMinor: number, currency: string): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: priceMinor % 100 === 0 ? 0 : 2 }).format(
    priceMinor / 100,
  );
}
