import { cookieAttributes, SECURE_COOKIES } from "@/lib/cookie-attributes";

/**
 * The beta terms text in force (PRD wave-1 §2.1 rules 3–4, data-model consents). Publishing a new text
 * means a new version here and new strings under `consent` in the dictionaries: everyone who accepted an
 * older one sees the screen again on their next visit (AUTH-5).
 */
export const BETA_TERMS_VERSION = "2026-11-beta";

/** The beta terms screen; every other screen waits until the user accepts (AUTH-4). */
export const CONSENT_PATH = "/onboarding/consent";
/** Language, theme and bot messages: the step after the first acceptance (screens.md §4.1). */
export const PREFERENCES_PATH = "/onboarding/preferences";

/**
 * Remembers on this device that the signed-in user accepted the version in force, so the proxy skips
 * the database on later requests: `<user id>:<version>`. Set only by the server and httpOnly; a value
 * for another user or another version counts as nothing, and the proxy then asks the database again.
 */
export const CONSENT_COOKIE = "dafit-consent";

export const consentCookieValue = (userId: string) => `${userId}:${BETA_TERMS_VERSION}`;

export const consentCookieOptions = {
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
  httpOnly: true,
  ...cookieAttributes(SECURE_COOKIES),
};
