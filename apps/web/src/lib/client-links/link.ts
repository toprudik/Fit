/**
 * Client links and trainer codes (PRD wave-1 §2.3, screens.md §1.7). A trainer's link carries a
 * 22-character token the database generates; QR codes encode the web address /i/<token>, so any
 * phone camera opens it, and the Mini App opens the same screen from startapp=ci_<token>. The
 * trainer code is 6 characters of A–Z and 2–9 without the look-alikes 0, O, 1 and I.
 */
export const CLIENT_CODE_LENGTH = 6;

/** startapp prefix of a client link: t.me/<bot>?startapp=ci_<token>. */
export const CLIENT_LINK_START_PREFIX = "ci_";

const TOKEN = /^[A-Za-z0-9_-]{22}$/;

/** True for something shaped like a link token; the database still decides whether it works. */
export function isClientLinkToken(value: string | null | undefined): value is string {
  return typeof value === "string" && TOKEN.test(value);
}

/** The landing of a link. */
export function clientLinkPath(token: string): string {
  return `/i/${token}`;
}

/** The web address in the QR and in "Копировать ссылку". */
export function clientLinkUrl(token: string, appUrl: string): string {
  return new URL(clientLinkPath(token), appUrl).toString();
}

/** The Mini App link that opens the landing in Telegram. */
export function clientLinkTelegram(token: string, botUsername: string): string {
  return `https://t.me/${botUsername}?startapp=${CLIENT_LINK_START_PREFIX}${token}`;
}

/** The code as the database compares it: letters and digits only, upper case. */
export function normalizeClientCode(input: string): string {
  return input.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

/** "Введите код тренера", with the code filled in when there is one. */
export function joinPath(code?: string | null): string {
  const normalized = normalizeClientCode(code ?? "");
  return normalized ? `/join?code=${normalized}` : "/join";
}

/**
 * The link token in a scanned QR: our web address (/i/<token>, on any host, since the database
 * decides what the token is worth) or a Telegram link with startapp=ci_<token>. Null for anything else.
 */
export function tokenFromScan(text: string): string | null {
  let url: URL;
  try {
    url = new URL(text.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const path = /^\/i\/([^/]+)\/?$/.exec(url.pathname);
  if (path) return isClientLinkToken(path[1]) ? path[1] : null;
  const start = url.searchParams.get("startapp");
  if (url.hostname === "t.me" && start?.startsWith(CLIENT_LINK_START_PREFIX)) {
    const token = start.slice(CLIENT_LINK_START_PREFIX.length);
    return isClientLinkToken(token) ? token : null;
  }
  return null;
}

/** "Анна Смирнова" from the profile parts; empty when there is no name. */
export function personName(first: string | null | undefined, last: string | null | undefined): string {
  return [first, last]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
}
