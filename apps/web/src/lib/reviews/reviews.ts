/**
 * Reviews (PRD wave-2 §11, Q53): a client of a pair with three or more attended sessions rates the trainer 1–5
 * with an optional text; the trainer answers once and can dispute it. The database checks every rule again.
 */
export const REVIEW_SESSIONS_MIN = 3;
export const REVIEW_TEXT_MAX = 2000;
export const RATINGS = [1, 2, 3, 4, 5] as const;

export const DISPUTE_REASONS = ["insult", "false_facts", "not_my_client", "other"] as const;
export type DisputeReason = (typeof DISPUTE_REASONS)[number];

export type ReviewStatus = "published" | "disputed" | "hidden";

export type Review = {
  id: string;
  coachingId: string;
  rating: number;
  body: string | null;
  status: ReviewStatus;
  hiddenReason: string | null;
  reply: string | null;
  repliedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export const isRating = (value: unknown): value is (typeof RATINGS)[number] => (RATINGS as readonly unknown[]).includes(value);
export const isDisputeReason = (value: unknown): value is DisputeReason => (DISPUTE_REASONS as readonly unknown[]).includes(value);

/** What a text field holds once trimmed: null when empty, "long" over the limit. */
export function reviewText(value: string | null | undefined): string | null | "long" {
  const text = (value ?? "").trim();
  if (!text) return null;
  return text.length > REVIEW_TEXT_MAX ? "long" : text;
}

type ReviewRow = {
  id: string;
  coaching_id: string;
  rating: number;
  body: string | null;
  status: ReviewStatus;
  hidden_reason: string | null;
  trainer_reply: string | null;
  trainer_replied_at: string | null;
  created_at: string;
  updated_at: string;
};

export const REVIEW_COLUMNS =
  "id, coaching_id, rating, body, status, hidden_reason, trainer_reply, trainer_replied_at, created_at, updated_at" as const;

export function reviewOf(row: ReviewRow): Review {
  return {
    id: row.id,
    coachingId: row.coaching_id,
    rating: row.rating,
    body: row.body,
    status: row.status,
    hiddenReason: row.hidden_reason,
    reply: row.trainer_reply,
    repliedAt: row.trainer_replied_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
