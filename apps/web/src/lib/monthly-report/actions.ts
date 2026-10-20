"use server";

import { isPairId } from "@/lib/pairs/clients";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isStoryKind, monthFromParam } from "./report";

export type StoryCardResult = { status: "created"; id: string } | { status: "consent" | "failed" };

/**
 * A story card of the client's month (PRD wave-3 §4-4). The database computes what the card shows from the
 * report, so nothing the browser sends ends up on it but the choice; weight needs `confirm` (§4-5). Before the
 * first card the person consents to publish story cards (152-FZ art. 10.1): "consent" asks for it.
 */
export async function createStoryCard(input: { month: string; kind: string; coachingId?: string; confirm?: boolean }): Promise<StoryCardResult> {
  const month = monthFromParam(input.month);
  if (!month || !isStoryKind(input.kind)) return { status: "failed" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_story_card", {
    p_month: month,
    p_kind: input.kind,
    p_coaching: input.kind === "trainer" ? input.coachingId : undefined,
    p_confirm: input.kind === "weight" && input.confirm === true,
  });
  if (error?.message === "consent_required") return { status: "consent" };
  if (error || typeof data !== "string") {
    console.error("creating a story card failed", error?.code);
    return { status: "failed" };
  }
  return { status: "created", id: data };
}

/**
 * Sends the client's month to the trainer of a live pair (PRD wave-3 §4 rule 3). The database checks the pair and
 * builds the copy, so the browser sends only the month and the pair.
 */
export async function shareMonthlyReport(input: { month: string; coachingId: string }): Promise<{ status: "sent" | "failed" }> {
  const month = monthFromParam(input.month);
  if (!month || !isPairId(input.coachingId)) return { status: "failed" };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("share_monthly_report", { p_month: month, p_coaching: input.coachingId });
  if (error) {
    console.error("sending the monthly report failed", error.code);
    return { status: "failed" };
  }
  return { status: "sent" };
}
