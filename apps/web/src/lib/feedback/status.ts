import type { Database } from "@/lib/supabase/database.types";

export type FeedbackStatus = Database["public"]["Enums"]["feedback_status"];
export const FEEDBACK_STATUSES: readonly FeedbackStatus[] = ["new", "in_progress", "closed"];
export const STATUS_TONE = { new: "accent", in_progress: "warning", closed: "neutral" } as const;

/** The longest answer an admin sends to the author (ADM-10); the database checks it too. */
export const MAX_REPLY_LENGTH = 2000;

export function isFeedbackStatus(value: unknown): value is FeedbackStatus {
  return typeof value === "string" && (FEEDBACK_STATUSES as readonly string[]).includes(value);
}
