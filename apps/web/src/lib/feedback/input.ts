import { z } from "zod";
import { LOCALES } from "@/i18n/config";
import { ZONES } from "@/lib/navigation/zones";

/** The form's limits (PRD wave-1 §2.13-2, FDBK-3) and the database checks on public.feedback. */
export const FEEDBACK_KINDS = ["bug", "idea", "other"] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];
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

export const feedbackInput = z.object({
  id: z.uuid(),
  kind: z.enum(FEEDBACK_KINDS),
  body: z.string().trim().min(1).max(MAX_FEEDBACK_LENGTH),
  route: z.string().max(200).nullable(),
  zone: z.enum(ZONES).nullable(),
  platform: z.string().max(32).nullable(),
  locale: z.enum(LOCALES),
  theme: z.enum(["light", "dark"]).nullable(),
  screenshots: z.array(z.string()).max(MAX_SCREENSHOTS),
});

export type FeedbackInput = z.infer<typeof feedbackInput>;
