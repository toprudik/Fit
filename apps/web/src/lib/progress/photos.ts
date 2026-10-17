/**
 * Progress photos (PRD wave-1 §2.11-3..8): a set is the photos of one date, one per angle (R82). Only the copy
 * blurred on the device is uploaded, into bucket progress-photos at {client_id}/{id}.webp or .jpg.
 */
export const PHOTO_ANGLES = ["front", "side", "back"] as const;

export type PhotoAngle = (typeof PHOTO_ANGLES)[number];

export const BLUR_METHODS = ["auto", "auto+brush", "brush", "none_no_face"] as const;

export type BlurMethod = (typeof BLUR_METHODS)[number];

export const PHOTO_BUCKET = "progress-photos";

/** Signed links live five minutes, so a revoked share stops old links soon after (PROG-6). */
export const SIGNED_URL_TTL = 300;

export const PHOTO_TYPES = { "image/webp": "webp", "image/jpeg": "jpg" } as const;

export type PhotoType = keyof typeof PHOTO_TYPES;

/** The longest side a photo keeps after the editor scales it down. */
export const MAX_PHOTO_SIDE = 1600;

export function isPhotoAngle(value: unknown): value is PhotoAngle {
  return typeof value === "string" && (PHOTO_ANGLES as readonly string[]).includes(value);
}

export function isBlurMethod(value: unknown): value is BlurMethod {
  return typeof value === "string" && (BLUR_METHODS as readonly string[]).includes(value);
}

export function photoPath(clientId: string, id: string, type: PhotoType): string {
  return `${clientId}/${id}.${PHOTO_TYPES[type]}`;
}

/**
 * How the face was hidden, from what the editor did: found and blurred automatically, touched up or painted by
 * hand, or nothing to hide because the client confirmed there is no face. Null when the photo may not be saved
 * yet: no blur at all and no confirmation (PROG-4).
 */
export function blurMethod(input: { autoFaces: number; brushed: boolean; noFaceConfirmed: boolean }): BlurMethod | null {
  if (input.autoFaces > 0) return input.brushed ? "auto+brush" : "auto";
  if (input.brushed) return "brush";
  return input.noFaceConfirmed ? "none_no_face" : null;
}

export type PhotoSet = { date: string; photos: Partial<Record<PhotoAngle, { id: string; url: string; width: number; height: number }>> };
