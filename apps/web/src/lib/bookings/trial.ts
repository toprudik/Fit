import "server-only";
import type { BookableSlot, BookingStatus } from "@/lib/bookings/load";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/**
 * Free slots a trial link's trial fits in, for two weeks (get_trial_slots, anyone). Empty when the signed-in
 * caller may not book a trial through it: their own link, an existing client, or a trial already asked for.
 */
export async function loadTrialSlots(supabase: Supabase, token: string): Promise<BookableSlot[]> {
  const { data, error } = await supabase.rpc("get_trial_slots", { p_token: token });
  if (error) throw new Error(`loading trial slots failed: ${error.code}`);
  return data.map((slot) => ({
    id: slot.slot_id,
    startsAt: slot.starts_at,
    endsAt: slot.ends_at,
    mode: slot.mode,
    place: slot.location_name,
  }));
}

export type LiveTrial = { id: string; status: BookingStatus };

/** The signed-in client's requested or confirmed trial with this trainer, if there is one. */
export async function loadLiveTrial(supabase: Supabase, userId: string, trainerId: string): Promise<LiveTrial | null> {
  const { data, error } = await supabase
    .from("bookings")
    .select("id, status")
    .eq("client_id", userId)
    .eq("trainer_id", trainerId)
    .eq("source", "trial")
    .in("status", ["requested", "confirmed"])
    .limit(1);
  if (error) throw new Error(`loading the trial booking failed: ${error.code}`);
  return data[0] ?? null;
}
