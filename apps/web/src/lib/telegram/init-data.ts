import { createHmac, timingSafeEqual } from "node:crypto";
import type { TelegramIdentity } from "./identity";

export class InitDataError extends Error {}

type Options = {
  botToken: string;
  /** Injected for tests. */
  now?: Date;
};

/**
 * Genuine initData: the user Telegram vouches for, when it signed the data (auth_date, Unix seconds) and the
 * `startapp` parameter of the launch, when there was one.
 */
export type VerifiedInitData = { identity: TelegramIdentity; authDate: number; startParam: string | null };

/**
 * Validates Telegram Mini App initData (raw query string) and returns the verified user. The age is
 * checked separately (assertInitDataFresh): it matters only for starting a new session.
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function verifyInitData(raw: string, { botToken, now = new Date() }: Options): VerifiedInitData {
  const { params, authDate } = verifySigned(raw, botToken, now);
  const userJson = params.get("user");
  if (!userJson) throw new InitDataError("missing user");
  let user: Record<string, unknown>;
  try {
    user = JSON.parse(userJson);
  } catch {
    throw new InitDataError("malformed user");
  }
  if (typeof user.id !== "number" || !Number.isSafeInteger(user.id)) throw new InitDataError("malformed user id");

  const str = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : null);
  const identity: TelegramIdentity = {
    telegramId: user.id,
    username: str(user.username),
    firstName: str(user.first_name),
    lastName: str(user.last_name),
    photoUrl: str(user.photo_url),
    languageCode: str(user.language_code),
    source: "mini-app",
  };
  return { identity, authDate, startParam: str(params.get("start_param")) };
}

/**
 * Checks Telegram's signature on a Mini App query string (initData, or the answer to requestContact) and
 * returns its fields without the hash, plus auth_date.
 */
function verifySigned(raw: string, botToken: string, now: Date): { params: URLSearchParams; authDate: number } {
  const params = new URLSearchParams(raw);
  const hash = params.get("hash");
  if (!hash || !/^[a-f0-9]{64}$/.test(hash)) throw new InitDataError("missing or malformed hash");
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join("\n");

  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = createHmac("sha256", secret).update(dataCheckString).digest();
  if (!timingSafeEqual(expected, Buffer.from(hash, "hex"))) throw new InitDataError("signature mismatch");

  // Number(null) is 0, so a missing auth_date has to be caught before the conversion.
  const rawAuthDate = params.get("auth_date");
  if (!rawAuthDate || !/^[1-9]\d{0,11}$/.test(rawAuthDate)) throw new InitDataError("missing auth_date");
  const authDate = Number(rawAuthDate);
  if (authDate - now.getTime() / 1000 > 60) throw new InitDataError("auth_date in the future");
  return { params, authDate };
}

/** The contact a user shared from the Mini App (requestContact), as Telegram signed it. */
export type VerifiedContact = { telegramId: number; phone: string; authDate: number };

/**
 * Validates the raw answer of the Mini App requestContact (`contact=…&auth_date=…&hash=…`), signed like
 * initData, and returns the shared phone number with the Telegram id it belongs to. Like initData, the age
 * is checked by the caller (assertInitDataFresh).
 */
export function verifyRequestedContact(raw: string, { botToken, now = new Date() }: Options): VerifiedContact {
  const { params, authDate } = verifySigned(raw, botToken, now);
  let contact: unknown;
  try {
    contact = JSON.parse(params.get("contact") ?? "");
  } catch {
    throw new InitDataError("malformed contact");
  }
  if (!contact || typeof contact !== "object") throw new InitDataError("malformed contact");
  const { user_id: telegramId, phone_number: phone } = contact as Record<string, unknown>;
  if (typeof telegramId !== "number" || !Number.isSafeInteger(telegramId)) throw new InitDataError("malformed contact user");
  if (typeof phone !== "string" || !phone) throw new InitDataError("missing phone number");
  return { telegramId, phone, authDate };
}

/**
 * Throws unless Telegram signed the initData within the last `maxAgeSeconds`. Only fresh initData may
 * start a new session, so an old one that leaked can't.
 */
export function assertInitDataFresh(
  { authDate }: { authDate: number },
  { maxAgeSeconds, now = new Date() }: { maxAgeSeconds: number; now?: Date },
) {
  if (now.getTime() / 1000 - authDate > maxAgeSeconds) throw new InitDataError("initData expired");
}
