import "server-only";
import type { ScheduleOwner } from "./load";

/**
 * Trainers' time zones for their clients' screens (SCHED-19), from public_profiles: a client reads the profile of a
 * trainer they are paired with. A trainer the client can't read is left out, so no caption shows for them.
 */
export async function loadTrainerZones(supabase: ScheduleOwner["supabase"], trainerIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(trainerIds)];
  if (ids.length === 0) return new Map();
  const { data } = await supabase.from("public_profiles").select("id, time_zone").in("id", ids);
  return new Map((data ?? []).flatMap((row) => (row.id && row.time_zone ? [[row.id, row.time_zone] as const] : [])));
}
