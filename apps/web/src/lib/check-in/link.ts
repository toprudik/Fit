import { isPairId } from "@/lib/pairs/clients";

/**
 * QR check-in (PRD wave-3 §5). The trainer's QR is a Mini App link, t.me/<bot>?startapp=ck_<session id>_<code>,
 * so Telegram's scanner and a phone camera both open DaFit on /client/checkin/<session id>?c=<code>. The code
 * changes every 15 seconds; the database decides whether it still works.
 */
export const CHECK_IN_START_PREFIX = "ck_";

/** The printed QR of a location (§5 rule 2b): t.me/<bot>?startapp=cl_<token>, a 22-character token that stays. */
export const PLACE_CHECK_IN_START_PREFIX = "cl_";

/** How often the trainer's screen fetches a new code: the database's window. */
export const CHECK_IN_REFRESH_MS = 15_000;

const CODE = /^[A-Za-z0-9_-]{10}$/;
const PLACE_TOKEN = /^[A-Za-z0-9_-]{22}$/;

export function isPlaceCheckInToken(value: unknown): value is string {
  return typeof value === "string" && PLACE_TOKEN.test(value);
}

export function placeCheckInPath(token: string): string {
  return `/client/checkin?place=${token}`;
}

export function placeCheckInTelegram(token: string, botUsername: string): string {
  return `https://t.me/${botUsername}?startapp=${PLACE_CHECK_IN_START_PREFIX}${token}`;
}

/** The screen of a location's startapp parameter, or null. */
export function parsePlaceCheckInStartParam(param: string): string | null {
  if (!param.startsWith(PLACE_CHECK_IN_START_PREFIX)) return null;
  const token = param.slice(PLACE_CHECK_IN_START_PREFIX.length);
  return isPlaceCheckInToken(token) ? placeCheckInPath(token) : null;
}

export function isCheckInCode(value: unknown): value is string {
  return typeof value === "string" && CODE.test(value);
}

/** A session id is a uuid like a pair id. */
export const isSessionId = isPairId;

export function checkInPath(sessionId: string, code: string): string {
  return `/client/checkin/${sessionId}?c=${code}`;
}

export function checkInStartParam(sessionId: string, code: string): string {
  return `${CHECK_IN_START_PREFIX}${sessionId}_${code}`;
}

/** The link in the QR. */
export function checkInTelegram(sessionId: string, code: string, botUsername: string): string {
  return `https://t.me/${botUsername}?startapp=${checkInStartParam(sessionId, code)}`;
}

/** The session and code of a startapp parameter (without checking the prefix twice), or null. */
export function parseCheckInStartParam(param: string): { sessionId: string; code: string } | null {
  if (!param.startsWith(CHECK_IN_START_PREFIX)) return null;
  const rest = param.slice(CHECK_IN_START_PREFIX.length);
  const sessionId = rest.slice(0, 36);
  const code = rest.slice(37);
  if (rest[36] !== "_" || !isSessionId(sessionId) || !isCheckInCode(code)) return null;
  return { sessionId, code };
}

/** The screen a scanned QR asks for: a session or location check-in link, or null for anything else. */
export function checkInPathFromScan(text: string): string | null {
  let url: URL;
  try {
    url = new URL(text.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname !== "t.me") return null;
  const param = url.searchParams.get("startapp") ?? "";
  const parsed = parseCheckInStartParam(param);
  return parsed ? checkInPath(parsed.sessionId, parsed.code) : parsePlaceCheckInStartParam(param);
}
