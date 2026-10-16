/**
 * Trainer invite codes (PRD wave-1 §2.2, screens.md §1.7). The database hands out 12 characters of
 * A–Z and 2–9 without the look-alikes 0, O, 1 and I, and compares them without dashes, spaces or case
 * (private.normalize_trainer_invite_code). People see them in groups of four: ABCD-EFGH-JKLM.
 */
export const INVITE_CODE_LENGTH = 12;

/** startapp prefix of a trainer invite: t.me/<bot>?startapp=ti_<code>. */
export const INVITE_START_PREFIX = "ti_";

/** The code as the database compares it: letters and digits only, upper case. */
export function normalizeInviteCode(input: string): string {
  return input.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

/** "abcdefghjklm" → "ABCD-EFGH-JKLM"; a shorter or longer code is grouped the same way. */
export function formatInviteCode(code: string): string {
  return normalizeInviteCode(code).match(/.{1,4}/g)?.join("-") ?? "";
}

/** The Mini App link that opens the invite in Telegram. */
export function inviteTelegramLink(code: string, botUsername: string): string {
  return `https://t.me/${botUsername}?startapp=${INVITE_START_PREFIX}${normalizeInviteCode(code)}`;
}

/** The redeem screen for a code, or for typing one in when there is none. */
export function redeemPath(code?: string | null): string {
  const normalized = normalizeInviteCode(code ?? "");
  return normalized ? `/onboarding/trainer?code=${normalized}` : "/onboarding/trainer";
}
