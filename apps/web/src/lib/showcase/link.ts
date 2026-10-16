/**
 * The trainer's public showcase /trainers/<slug> (PRD wave-1 §2.3 rule 1, screens.md §1.7). The slug is
 * the address the trainer picks, 3–32 characters of a–z, 0–9 and "-", starting with a letter or digit
 * (the trainer_profiles check). The Mini App opens the same page from startapp=tp_<slug>.
 */
export const SHOWCASE_START_PREFIX = "tp_";

export const SLUG_MIN_LENGTH = 3;
export const SLUG_MAX_LENGTH = 32;

const SLUG = /^[a-z0-9][a-z0-9-]{2,31}$/;

/** True for an address the database would accept; whether a showcase is there is up to the database. */
export function isShowcaseSlug(value: string | null | undefined): value is string {
  return typeof value === "string" && SLUG.test(value);
}

/** What the trainer typed, as it is stored: no spaces around it, lower case. */
export function normalizeSlug(input: string): string {
  return input.trim().toLowerCase();
}

export function showcasePath(slug: string): string {
  return `/trainers/${slug}`;
}

/** The web address in the QR and in "Поделиться витриной". */
export function showcaseUrl(slug: string, appUrl: string): string {
  return new URL(showcasePath(slug), appUrl).toString();
}

/** The Mini App link that opens the showcase in Telegram. */
export function showcaseTelegram(slug: string, botUsername: string): string {
  return `https://t.me/${botUsername}?startapp=${SHOWCASE_START_PREFIX}${slug}`;
}
