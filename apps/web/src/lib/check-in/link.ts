import { isPairId } from "@/lib/pairs/clients";

/**
 * QR check-in (PRD wave-3 §5). The trainer's QR is a Mini App link, t.me/<bot>?startapp=ck_<session id>_<code>,
 * so Telegram's scanner and a phone camera both open DaFit on /client/checkin/<session id>?c=<code>. The code
 * changes every 15 seconds; the database decides whether it still works.
 */
export const CHECK_IN_START_PREFIX = "ck_";

/** How often the trainer's screen fetches a new code: the database's window. */
export const CHECK_IN_REFRESH_MS = 15_000;

const CODE = /^[A-Za-z0-9_-]{10}$/;

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

/** The screen a scanned QR asks for: a check-in link, or null for anything else. */
export function checkInPathFromScan(text: string): string | null {
  let url: URL;
  try {
    url = new URL(text.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname !== "t.me") return null;
  const parsed = parseCheckInStartParam(url.searchParams.get("startapp") ?? "");
  return parsed ? checkInPath(parsed.sessionId, parsed.code) : null;
}
