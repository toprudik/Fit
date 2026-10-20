import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Constant-time check of "Authorization: Bearer <secret>" for the endpoints a machine calls with a shared secret
 * (pg_cron, the bot). Hashing both sides first makes the lengths equal, so neither the length nor a prefix of the
 * secret leaks through timing. An unset or empty secret never matches.
 */
export function hasBearer(header: string | null, secret: string | undefined): boolean {
  if (!secret) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(header ?? ""), digest(`Bearer ${secret}`));
}
