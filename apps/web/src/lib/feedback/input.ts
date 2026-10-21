import type { Locale } from "@/i18n/config";
import type { Zone } from "@/lib/navigation/zones";

// The feedback form imports this module, so it stays free of zod; the schema lives in ./schema (server only).

/** The form's limits (PRD wave-1 §2.13-2, FDBK-3) and the database checks on public.feedback. */
export const FEEDBACK_KINDS = ["bug", "idea", "data_request", "other"] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];
/**
 * What "Запрос о моих данных" asks for (152-FZ arts. 9, 14, 20, 21; GDPR arts. 7, 15–21): see the data, get a copy,
 * correct or delete it, withdraw a consent, object, stop the processing, appeal a refusal. The team answers within
 * 10 working days, and stops publishing within 3 once that consent is withdrawn (migration 20261020190517).
 */
export const DATA_REQUEST_TYPES = [
  "access",
  "export",
  "correction",
  "deletion",
  "withdraw",
  "objection",
  "stop",
  "appeal",
  "other",
] as const;
export type DataRequestType = (typeof DATA_REQUEST_TYPES)[number];
/** The consents a "withdraw" request can take back. */
export const CONSENT_KINDS = ["processing", "health", "marketing", "publication"] as const;
export type ConsentKind = (typeof CONSENT_KINDS)[number];

export function isDataRequestType(value: unknown): value is DataRequestType {
  return typeof value === "string" && (DATA_REQUEST_TYPES as readonly string[]).includes(value);
}

export function isConsentKind(value: unknown): value is ConsentKind {
  return typeof value === "string" && (CONSENT_KINDS as readonly string[]).includes(value);
}
export const MAX_FEEDBACK_LENGTH = 5000;
export const MAX_SCREENSHOTS = 3;
/** The feedback bucket's own limits (migration 20261015125200_storage). */
export const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;
export const SCREENSHOT_TYPES = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" } as const;

export type ScreenshotType = keyof typeof SCREENSHOT_TYPES;

export function isScreenshotType(type: string): type is ScreenshotType {
  return Object.hasOwn(SCREENSHOT_TYPES, type);
}

/** The object name of screenshot n (1..3) of one message: <user>/<feedback>/<n>.<ext>, as the table check wants. */
export function screenshotPath(userId: string, feedbackId: string, n: number, type: ScreenshotType): string {
  return `${userId}/${feedbackId}/${n}.${SCREENSHOT_TYPES[type]}`;
}

/** What a screenshot may be before it is uploaded: a picture of an accepted type, 5 MB at most. */
export function screenshotProblem(file: { type: string; size: number }): "type" | "size" | null {
  if (!isScreenshotType(file.type)) return "type";
  if (file.size <= 0 || file.size > MAX_SCREENSHOT_BYTES) return "size";
  return null;
}

/** Where the form was sent from, for the team (§2.13-3): "tma-mobile", "tma-desktop", "web-mobile" or "web-desktop". */
export function platformLabel(input: { inTelegram: boolean; coarsePointer: boolean }): string {
  return `${input.inTelegram ? "tma" : "web"}-${input.coarsePointer ? "mobile" : "desktop"}`;
}

/** A route the form may record: an app path without the query, so search terms and tokens stay out. */
export function routeOf(from: string | null | undefined): string | null {
  if (!from || !from.startsWith("/") || from.startsWith("//")) return null;
  const path = from.split(/[?#]/)[0];
  return path.slice(0, 200) || null;
}

/** What the form sends; ./schema checks it on the server. */
export type FeedbackInput = {
  id: string;
  kind: FeedbackKind;
  /** Only for a data request, and then required. */
  requestType: DataRequestType | null;
  /** Only when withdrawing a consent, and then required. */
  consentKind: ConsentKind | null;
  body: string;
  route: string | null;
  zone: Zone | null;
  platform: string | null;
  locale: Locale;
  theme: "light" | "dark" | null;
  screenshots: string[];
};
