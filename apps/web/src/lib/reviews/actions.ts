"use server";

import { refresh } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isDisputeReason, isRating, reviewText, type DisputeReason } from "./reviews";

export type ReviewActionResult = { ok: true } | { ok: false; reason: "invalid" | "tooFew" | "failed" };

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const isId = (value: unknown): value is string => typeof value === "string" && ID.test(value);

function failed(what: string, error: { code: string }): ReviewActionResult {
  console.error(`${what} failed`, error.code);
  return { ok: false, reason: "failed" };
}

/** "Отправить" in the review sheet: leaves or edits the pair's one review (§11 rules 1–3). */
export async function saveReview(input: { coachingId: string; rating: number; body: string | null }): Promise<ReviewActionResult> {
  const body = reviewText(input.body);
  if (!isId(input.coachingId) || !isRating(input.rating) || body === "long") return { ok: false, reason: "invalid" };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("save_review", { p_coaching_id: input.coachingId, p_rating: input.rating, p_body: body as string });
  if (error?.message === "too_few_sessions") return { ok: false, reason: "tooFew" };
  if (error) return error.code === "42501" || error.code === "22023" ? { ok: false, reason: "invalid" } : failed("saving a review", error);
  refresh();
  return { ok: true };
}

/** "Удалить отзыв": the author removes it; the trainer no longer sees it. */
export async function deleteReview(coachingId: string): Promise<ReviewActionResult> {
  if (!isId(coachingId)) return { ok: false, reason: "invalid" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("delete_review", { p_coaching_id: coachingId });
  if (error) return failed("deleting a review", error);
  if (!data) return { ok: false, reason: "invalid" };
  refresh();
  return { ok: true };
}

/** The trainer's one answer to a review (§11 rule 5); an empty text removes it. */
export async function replyToReview(input: { reviewId: string; body: string | null }): Promise<ReviewActionResult> {
  const body = reviewText(input.body);
  if (!isId(input.reviewId) || body === "long") return { ok: false, reason: "invalid" };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("reply_to_review", { p_review_id: input.reviewId, p_body: body as string });
  if (error) return error.code === "42501" || error.code === "22023" ? { ok: false, reason: "invalid" } : failed("answering a review", error);
  refresh();
  return { ok: true };
}

/** "Оспорить" (§11 rule 7): the review goes to the admin's queue with the reason. */
export async function disputeReview(input: { reviewId: string; reason: DisputeReason; body: string | null }): Promise<ReviewActionResult> {
  const body = reviewText(input.body);
  if (!isId(input.reviewId) || !isDisputeReason(input.reason) || body === "long") return { ok: false, reason: "invalid" };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("dispute_review", { p_review_id: input.reviewId, p_reason: input.reason, p_body: body as string });
  if (error) return error.code === "42501" || error.code === "22023" ? { ok: false, reason: "invalid" } : failed("disputing a review", error);
  refresh();
  return { ok: true };
}
