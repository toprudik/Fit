import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const LABEL = "dafit/bot-actions/v1";

/**
 * Bearer secret the bot sends to POST /api/bot/actions: hex(HMAC-SHA256(key=token, msg=LABEL)). Both projects
 * already hold TELEGRAM_BOT_TOKEN, so there is no extra variable to set, and it rotates with the token, like the
 * webhook secret (ADR 0002 §7). apps/bot/src/fit_bot/config.py derives the same value.
 */
export function botActionsSecret(token: string): string {
  return createHmac("sha256", token).update(LABEL).digest("hex");
}

/** Constant-time check of "Authorization: Bearer <secret>". Hashing first makes the lengths equal. */
export function isBotAuthorized(header: string | null, token: string): boolean {
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(header ?? ""), digest(`Bearer ${botActionsSecret(token)}`));
}
