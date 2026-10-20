/**
 * The health notice (legal health-disclaimer, product change 8): a screen read once before workouts, the
 * questionnaire and the first nutrition target, closed with "Понятно". This device remembers it in a cookie that
 * names the notice's version, so a new version shows again.
 */
export const HEALTH_NOTICE_COOKIE = "dafit-health-notice";
export const HEALTH_NOTICE_VERSION = "2026-10-18";

/** The full text among the legal documents. */
export const HEALTH_NOTICE_PATH = "/legal/health";

export function isHealthNoticeSeen(cookie: string | undefined): boolean {
  return cookie === HEALTH_NOTICE_VERSION;
}
