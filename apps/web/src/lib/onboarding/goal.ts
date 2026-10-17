import "server-only";
import type { Goal } from "@/lib/nutrition/target";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** The goal step of the client's onboarding (wave-2 §1 rule 4), after the intake of a new pair. */
export const clientGoalPath = (coachingId: string) => `/client/trainers/${coachingId}/goal`;

/** The signed-in user's current goal (the latest one set), or null when they have none or are signed out. */
export async function loadOwnGoal(): Promise<Goal | null> {
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  const userId = session?.claims.sub;
  if (!userId) return null;
  const { data, error } = await supabase
    .from("client_goals")
    .select("goal")
    .eq("user_id", userId)
    .order("set_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`loading the goal failed: ${error.code}`);
  return data?.goal ?? null;
}
