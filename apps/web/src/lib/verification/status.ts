import type { Database } from "@/lib/supabase/database.types";

export type VerificationStatus = Database["public"]["Enums"]["verification_status"];

/** Badge color of each status; the word always comes with it. */
export const STATUS_TONE = {
  not_submitted: "neutral",
  pending: "accent",
  verified: "success",
  rejected: "danger",
} as const satisfies Record<VerificationStatus, string>;
