/**
 * A client's referral link (PRD wave-3 §3.1-3, screens.md §1.7): the database makes a 10-character code of
 * a-z and 0-9 per pair. The web address is /r/<code>, and the Mini App opens the same landing from
 * startapp=rf_<code>.
 */

/** startapp prefix of a referral link: t.me/<bot>?startapp=rf_<code>. */
export const REFERRAL_START_PREFIX = "rf_";

const CODE = /^[a-z0-9]{10}$/;

/** True for something shaped like a referral code; the database still decides whether it works. */
export function isReferralCode(value: string | null | undefined): value is string {
  return typeof value === "string" && CODE.test(value);
}

/** The landing of a referral link. */
export function referralPath(code: string): string {
  return `/r/${code}`;
}

/** The web address a client shares. */
export function referralUrl(code: string, appUrl: string): string {
  return new URL(referralPath(code), appUrl).toString();
}

/** The Mini App link that opens the landing in Telegram. */
export function referralTelegram(code: string, botUsername: string): string {
  return `https://t.me/${botUsername}?startapp=${REFERRAL_START_PREFIX}${code}`;
}

/** The client's page of their referral link in one pair. */
export function clientReferralPath(coachingId: string): string {
  return `/client/trainers/${coachingId}/referral`;
}
