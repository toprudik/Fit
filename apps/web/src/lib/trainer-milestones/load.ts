import "server-only";

import { DEFAULT_TIME_ZONE } from "@/lib/plans/plans";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { trainerMilestoneRows } from "./milestones";

/**
 * "Мои вехи" of the signed-in trainer: the reached milestones and the counts behind the next ones, the same numbers
 * the triggers count: active pairs, and held sessions as the admin panel counts them (ended, not cancelled, with a
 * confirmed or attended booking; a group is one session). "signed-out" without a session, null without a
 * trainer profile.
 */
export async function loadTrainerMilestones() {
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  const user = session?.claims.sub;
  if (!user) return "signed-out" as const;
  const [trainer, reached, clients, sessions, settings] = await Promise.all([
    supabase.from("trainer_profiles").select("user_id").eq("user_id", user).maybeSingle(),
    supabase.from("trainer_milestones").select("kind, achieved_at").eq("trainer_id", user),
    supabase.from("coachings").select("id", { count: "exact", head: true }).eq("trainer_id", user).eq("status", "active"),
    supabase
      .from("sessions")
      .select("id, bookings!inner(id)", { count: "exact", head: true })
      .eq("trainer_id", user)
      .neq("status", "cancelled")
      .lte("ends_at", new Date().toISOString())
      .in("bookings.status", ["confirmed", "attended"]),
    supabase.from("user_settings").select("time_zone").eq("user_id", user).maybeSingle(),
  ]);
  const failed = [trainer, reached, clients, sessions, settings].find((result) => result.error);
  if (failed?.error) throw new Error(`loading trainer milestones failed: ${failed.error.code}`);
  if (!trainer.data) return null;
  return {
    timeZone: settings.data?.time_zone ?? DEFAULT_TIME_ZONE,
    rows: trainerMilestoneRows(reached.data ?? [], { clients: clients.count ?? 0, sessions: sessions.count ?? 0 }),
  };
}
