"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { REVIEW_TEXT_MAX } from "@/lib/reviews/reviews";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ReviewDecisionResult = { status: "done" | "closed" | "invalid" | "failed" };

const decisionInput = z.discriminatedUnion("hide", [
  z.object({ reportId: z.uuid(), hide: z.literal(false) }),
  z.object({ reportId: z.uuid(), hide: z.literal(true), reason: z.string().trim().min(1).max(REVIEW_TEXT_MAX) }),
]);

/**
 * "Оставить" or "Скрыть" in /admin/reviews (wave-2 §11 rule 7). admin_decide_review_dispute checks the admin,
 * closes every open dispute of the review and writes the audit log; a hidden review shows its author the reason.
 */
export async function decideReviewDispute(raw: { reportId: string; hide: boolean; reason?: string }): Promise<ReviewDecisionResult> {
  const parsed = decisionInput.safeParse(raw);
  if (!parsed.success) return { status: "invalid" };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_decide_review_dispute", {
    p_report_id: parsed.data.reportId,
    p_hide: parsed.data.hide,
    p_reason: parsed.data.hide ? parsed.data.reason : undefined,
  });
  if (error) {
    // P0002: another admin decided first, so the dispute is no longer open.
    if (error.code === "P0002") return { status: "closed" };
    if (error.code === "22023") return { status: "invalid" };
    console.error("deciding a review dispute failed", error.code);
    return { status: "failed" };
  }
  refresh();
  return { status: "done" };
}
