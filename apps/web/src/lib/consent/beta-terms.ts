/**
 * The beta terms text in force (PRD wave-1 §2.1 rules 3–4, data-model consents). Publishing a new text
 * means a new version here and new strings under `consent` in the dictionaries: everyone who accepted an
 * older one sees the screen again on their next visit (AUTH-5). The other documents: lib/consent/required.
 */
export const BETA_TERMS_VERSION = "2026-11-beta";

/** The beta terms screen; every other screen waits until the user accepts (AUTH-4). */
export const CONSENT_PATH = "/onboarding/consent";
/** Language, theme and bot messages: the step after the first acceptance (screens.md §4.1). */
export const PREFERENCES_PATH = "/onboarding/preferences";
