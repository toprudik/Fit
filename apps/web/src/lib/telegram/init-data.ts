import { createHmac, timingSafeEqual } from "node:crypto";
import type { TelegramIdentity } from "./identity";

export class InitDataError extends Error {}

type Options = {
  botToken: string;
  /** Reject initData older than this many seconds. */
  maxAgeSeconds: number;
  /** Injected for tests. */
  now?: Date;
};

/**
 * Validates Telegram Mini App initData (raw query string) and returns the verified user.
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function verifyInitData(raw: string, { botToken, maxAgeSeconds, now = new Date() }: Options): TelegramIdentity {
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
  const ageSeconds = now.getTime() / 1000 - authDate;
  if (ageSeconds > maxAgeSeconds) throw new InitDataError("initData expired");
  if (ageSeconds < -60) throw new InitDataError("auth_date in the future");

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
  return {
    telegramId: user.id,
    username: str(user.username),
    firstName: str(user.first_name),
    lastName: str(user.last_name),
    photoUrl: str(user.photo_url),
    languageCode: str(user.language_code),
    source: "mini-app",
  };
}
