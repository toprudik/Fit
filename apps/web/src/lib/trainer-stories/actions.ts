"use server";

import { isTrainerStoryKind, monthFromParam } from "@/lib/monthly-report/report";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type TrainerStoryResult = { status: "created"; id: string } | { status: "empty" | "consent" | "failed" };

/**
 * A trainer's story card (marketing backlog 5): «Мой месяц в DaFit» of a finished month or the showcase with its QR.
 * The database counts the month and checks the showcase is open, so the browser sends only the choice.
 */
export async function createTrainerStoryCard(input: { kind: string; month?: string }): Promise<TrainerStoryResult> {
  if (!isTrainerStoryKind(input.kind)) return { status: "failed" };
  const month = input.kind === "trainer_month" ? monthFromParam(input.month ?? "") : null;
  if (input.kind === "trainer_month" && !month) return { status: "failed" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_trainer_story_card", { p_kind: input.kind, p_month: month ?? undefined });
  if (error) {
    if (error.message === "nothing_to_show") return { status: "empty" };
    // The publication consent of legal item 12: the card waits until the trainer gives it.
    if (error.message === "consent_required") return { status: "consent" };
    console.error("creating a trainer story card failed", error.code);
    return { status: "failed" };
  }
  return typeof data === "string" ? { status: "created", id: data } : { status: "failed" };
}
