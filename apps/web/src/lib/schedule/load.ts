import "server-only";
import { DEFAULT_TIME_ZONE } from "@/lib/plans/plans";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ScheduleOwner = {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  userId: string;
  /** The trainer's zone from user_settings: the schedule's days and times are in it (PRD 2.6.7). */
  timeZone: string;
};

/** The signed-in user and their zone for the schedule screens, or null when nobody is signed in. */
export async function loadScheduleOwner(): Promise<ScheduleOwner | null> {
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  const userId = session?.claims.sub;
  if (!userId) return null;
  const { data: settings } = await supabase.from("user_settings").select("time_zone").eq("user_id", userId).maybeSingle();
  return { supabase, userId, timeZone: settings?.time_zone ?? DEFAULT_TIME_ZONE };
}
