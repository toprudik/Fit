import type { Database } from "@/lib/supabase/database.types";

export type FeedbackStatus = Database["public"]["Enums"]["feedback_status"];
export const FEEDBACK_STATUSES: readonly FeedbackStatus[] = ["new", "in_progress", "closed"];
export const STATUS_TONE = { new: "accent", in_progress: "warning", closed: "neutral" } as const;

export function isFeedbackStatus(value: unknown): value is FeedbackStatus {
  return typeof value === "string" && (FEEDBACK_STATUSES as readonly string[]).includes(value);
}
