"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isStoryKind, monthFromParam } from "./report";

export type StoryCardResult = { status: "created"; id: string } | { status: "failed" };

/**
 * A story card of the client's month (PRD wave-3 §4-4). The database computes what the card shows from the
 * report, so nothing the browser sends ends up on it but the choice; weight needs `confirm` (§4-5).
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
  if (error || typeof data !== "string") {
    console.error("creating a story card failed", error?.code);
    return { status: "failed" };
  }
  return { status: "created", id: data };
}
