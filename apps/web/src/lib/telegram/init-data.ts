import { createHmac, timingSafeEqual } from "node:crypto";
import type { TelegramIdentity } from "./identity";

export class InitDataError extends Error {}

type Options = {
  botToken: string;
  /** Injected for tests. */
  now?: Date;
};

/** Genuine initData: the user Telegram vouches for and when it signed the data (auth_date, Unix seconds). */
export type VerifiedInitData = { identity: TelegramIdentity; authDate: number };

/**
 * Validates Telegram Mini App initData (raw query string) and returns the verified user. The age is
 * checked separately (assertInitDataFresh): it matters only for starting a new session.
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function verifyInitData(raw: string, { botToken, now = new Date() }: Options): VerifiedInitData {
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

  const authDate = Number(params.get("auth_date"));
  if (!Number.isInteger(authDate)) throw new InitDataError("missing auth_date");
  if (authDate - now.getTime() / 1000 > 60) throw new InitDataError("auth_date in the future");

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
  return { identity, authDate };
}

/**
 * Throws unless Telegram signed the initData within the last `maxAgeSeconds`. Only fresh initData may
 * start a new session, so an old one that leaked can't.
 */
export function assertInitDataFresh(
  { authDate }: VerifiedInitData,
  { maxAgeSeconds, now = new Date() }: { maxAgeSeconds: number; now?: Date },
) {
  if (now.getTime() / 1000 - authDate > maxAgeSeconds) throw new InitDataError("initData expired");
}
