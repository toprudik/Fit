"use server";

import { refresh } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isWeekGoal } from "./gamification";

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The weekly workouts goal of a client's streak, set by the client or a trainer of the pair (wave-3 §2.1-1). */
export async function setWorkoutWeekGoal(input: { clientId: string; perWeek: number }): Promise<{ ok: boolean }> {
  if (!ID.test(input.clientId) || !isWeekGoal(input.perWeek)) return { ok: false };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_workout_week_goal", { p_client: input.clientId, p_per_week: input.perWeek });
  if (error) {
    console.error("setting the weekly goal failed", error.code);
    return { ok: false };
  }
  refresh();
  return { ok: true };
}

/** The client has seen the celebration of their new badges. */
export async function markBadgesSeen(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("mark_badges_seen");
  if (error) console.error("marking badges seen failed", error.code);
}
