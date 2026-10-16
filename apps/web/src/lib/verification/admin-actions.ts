"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const decideInput = z.discriminatedUnion("decision", [
  z.object({ trainerId: z.uuid(), decision: z.literal("verified") }),
  z.object({ trainerId: z.uuid(), decision: z.literal("rejected"), reason: z.string().trim().min(1).max(1000) }),
]);

export type DecideResult = { status: "done" | "reason-required" | "already-decided" | "failed" };

/**
 * "Верифицировать" / "Отклонить" in /admin/verification. admin_decide_verification checks that the caller is
 * an admin, writes the audit log and queues the bot message to the trainer (ADM-4, ADM-5).
 */
export async function decideVerification(
  input: { trainerId: string; decision: "verified" } | { trainerId: string; decision: "rejected"; reason: string },
): Promise<DecideResult> {
  const parsed = decideInput.safeParse(input);
  if (!parsed.success) return { status: input.decision === "rejected" ? "reason-required" : "failed" };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_decide_verification", {
    p_trainer_id: parsed.data.trainerId,
    p_decision: parsed.data.decision,
    p_reason: parsed.data.decision === "rejected" ? parsed.data.reason : undefined,
  });
  if (!error) {
    refresh();
    return { status: "done" };
  }
  if (error.message === "verification_not_pending") {
    // Another admin decided first: the queue shows it without this trainer.
    refresh();
    return { status: "already-decided" };
  }
  if (error.message === "reason_required") return { status: "reason-required" };
  console.error("deciding verification failed", error.code);
  return { status: "failed" };
}
