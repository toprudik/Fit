import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Limits of the endpoints that act before there is a user session to hang a database limit on (migration
 * 20261018135217_rate_limits.sql). Each fresh Mini App sign-in and each bot tap mints a Supabase session with the
 * secret key; Supabase Auth limits those per server IP, so one person repeating them could lock everyone out.
 * Writes users make themselves (feedback) are limited by the database's own triggers instead.
 */
export const RATE_LIMITS = {
  /** A fresh Mini App sign-in of one Telegram account: page loads with a session never count. */
  miniAppSignIn: { bucket: "sign-in:mini-app", limit: 20, windowSeconds: 600 },
  /** Taps on the bot's action buttons of one Telegram account. */
  botAction: { bucket: "bot:action", limit: 30, windowSeconds: 60 },
} as const;

export type RateLimit = (typeof RATE_LIMITS)[keyof typeof RATE_LIMITS];

/**
 * Counts one hit of `subject` and says whether it is within the limit. Fails open: when the database can't
 * answer, the request goes on as before, since the limit protects capacity, not data.
 */
export async function withinRateLimit({ bucket, limit, windowSeconds }: RateLimit, subject: string): Promise<boolean> {
  const { data, error } = await createSupabaseAdminClient().rpc("rate_limit_hit", {
    p_bucket: bucket,
    p_subject: subject,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    console.error("checking a rate limit failed", error.code);
    return true;
  }
  return data !== false;
}
