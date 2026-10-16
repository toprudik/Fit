import { isPairId } from "@/lib/pairs/clients";

/**
 * "Попросить связаться" (PRD wave-1 §2.12 rules 2-3, PRIV-2): one request to the same person in 24 hours
 * (request_contact checks it too); the bot message С1 opens /contact/<request id>, and a launch of the
 * Mini App by startapp=cr_<request id> opens the same screen.
 */
export const CONTACT_REQUEST_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export const CONTACT_START_PREFIX = "cr_";

export type ContactRequestStatus = "pending" | "accepted" | "declined" | "expired";

/** When the next request to the same person is allowed, or null when it already is. */
export function nextContactRequestAt(lastRequestedAt: string | null, now = new Date()): Date | null {
  if (!lastRequestedAt) return null;
  const next = new Date(new Date(lastRequestedAt).getTime() + CONTACT_REQUEST_COOLDOWN_MS);
  return next > now ? next : null;
}

export function contactRequestPath(id: string): string {
  return `/contact/${id}`;
}

/** The Mini App link to the answer screen, for whoever opened it on the website. */
export function contactRequestTelegram(id: string, botUsername: string): string {
  return `https://t.me/${botUsername}?startapp=${CONTACT_START_PREFIX}${id}`;
}

/** A request id is a uuid like a pair id. */
export const isContactRequestId = isPairId;
