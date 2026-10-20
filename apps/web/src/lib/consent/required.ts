import { BETA_TERMS_VERSION } from "./beta-terms";

/**
 * The separate consents (legal product-changes А1, А2; 152-FZ art. 9 part 1, art. 10). Every user accepts the
 * beta terms, the user agreement with the privacy policy and the "I am 18" statement on one screen, then the
 * consent to process personal data on a screen of its own. The consent on health data comes after them and may
 * be declined: the app works without it. A new edition of a document gets a new version here, and everyone
 * sees that screen again (право 15).
 */
export const LEGAL_VERSION = "2026-11";

export type ConsentKind = "beta_terms" | "terms" | "privacy_policy" | "age_confirmed" | "pd_general" | "pd_health";

/** What the terms screen records. */
export const TERMS_CONSENTS = [
  { kind: "beta_terms", version: BETA_TERMS_VERSION },
  { kind: "terms", version: LEGAL_VERSION },
  { kind: "privacy_policy", version: LEGAL_VERSION },
  { kind: "age_confirmed", version: LEGAL_VERSION },
] as const satisfies readonly { kind: ConsentKind; version: string }[];

export const PERSONAL_CONSENT = { kind: "pd_general", version: LEGAL_VERSION } as const;
export const HEALTH_CONSENT = { kind: "pd_health", version: LEGAL_VERSION } as const;

/** The consents the proxy waits for before any other screen. */
export const REQUIRED_CONSENTS = [...TERMS_CONSENTS, PERSONAL_CONSENT] as const;

/** Kinds the screens read back. */
export const CONSENT_KINDS = [...REQUIRED_CONSENTS, HEALTH_CONSENT].map((consent) => consent.kind);

export type ConsentRow = { kind: string; version: string };

const has = (rows: readonly ConsentRow[], consent: { kind: string; version: string }) =>
  rows.some((row) => row.kind === consent.kind && row.version === consent.version);

/** The required screen still waiting for this user (rows: their consents not revoked), or null when none is. */
export function pendingStep(rows: readonly ConsentRow[]): "terms" | "personal" | null {
  if (TERMS_CONSENTS.some((consent) => !has(rows, consent))) return "terms";
  if (!has(rows, PERSONAL_CONSENT)) return "personal";
  return null;
}

/** Whether the health data consent in force is given. */
export const hasHealthConsent = (rows: readonly ConsentRow[]) => has(rows, HEALTH_CONSENT);

/** The terms consents this user still has to record, for the "Принимаю" button. */
export const missingTermsConsents = (rows: readonly ConsentRow[]) => TERMS_CONSENTS.filter((consent) => !has(rows, consent));
