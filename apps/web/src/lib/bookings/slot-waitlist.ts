import "server-only";
import type { BookableSlot } from "@/lib/bookings/load";
import type { ScheduleOwner, SessionWaitlistEntry } from "@/lib/schedule/load";
import { clientNames } from "@/lib/schedule/load";

/** A booked slot of the trainer the client can queue for (PRD wave-2 §9): how many wait, and the client's own entry. */
export type QueueSlot = BookableSlot & { waiting: number; myEntryId: string | null };

/** Booked personal slots of a trainer on /client/book, still early enough for an offer to reach the queue. */
export async function loadQueueSlots(owner: ScheduleOwner, trainerId: string, now: Date, until: Date): Promise<QueueSlot[]> {
  const { supabase } = owner;
  const { data, error } = await supabase.rpc("waitlist_slots", {
    p_trainer_id: trainerId,
    p_from: now.toISOString(),
    p_until: until.toISOString(),
  });
  if (error) throw new Error(`loading queue slots failed: ${error.code}`);
  const locationIds = [...new Set(data.map((row) => row.location_id).filter((id): id is string => Boolean(id)))];
  const locations = locationIds.length ? await supabase.from("locations").select("id, name").in("id", locationIds) : { data: [] };
  const placeName = new Map((locations.data ?? []).map((location) => [location.id, location.name]));
  return data.map((row) => ({
    id: row.slot_id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    mode: row.mode,
    place: row.location_id ? (placeName.get(row.location_id) ?? null) : null,
    waiting: row.waiting,
    myEntryId: row.my_entry_id,
  }));
}

/** The queue for the slot of a personal session, for its trainer: offers first, then the waiting in order. */
export async function loadSlotWaitlist(owner: ScheduleOwner, sessionId: string): Promise<SessionWaitlistEntry[]> {
  const { supabase } = owner;
  const { data: session, error: sessionError } = await supabase.from("sessions").select("slot_id").eq("id", sessionId).maybeSingle();
  if (sessionError) throw new Error(`loading the session slot failed: ${sessionError.code}`);
  if (!session?.slot_id) return [];
  const { data, error } = await supabase
    .from("waitlist_entries")
    .select("id, coaching_id, status, offer_expires_at")
    .eq("slot_id", session.slot_id)
    .in("status", ["waiting", "offered"])
    .order("joined_at")
    .order("id");
  if (error) throw new Error(`loading the slot waitlist failed: ${error.code}`);
  const names = await clientNames(
    supabase,
    data.map((row) => row.coaching_id),
  );
  let place = 0;
  const entries = data.map((row) => ({
    id: row.id,
    coachingId: row.coaching_id,
    name: names.get(row.coaching_id) ?? "",
    status: row.status as "waiting" | "offered",
    place: row.status === "waiting" ? ++place : null,
    offerExpiresAt: row.offer_expires_at,
  }));
  return [...entries.filter((entry) => entry.status === "offered"), ...entries.filter((entry) => entry.status === "waiting")];
}

/**
 * The queues of the trainer's free slots (PRD wave-2 §9-7): a slot that opened again goes to its first in line on
 * its own; here the trainer sees who still waits and can offer the slot out of turn when nobody holds it.
 */
export async function loadOpenSlotQueues(owner: ScheduleOwner, slotIds: string[]): Promise<Map<string, SessionWaitlistEntry[]>> {
  const queues = new Map<string, SessionWaitlistEntry[]>();
  if (slotIds.length === 0) return queues;
  const { supabase } = owner;
  const { data, error } = await supabase
    .from("waitlist_entries")
    .select("id, slot_id, coaching_id, status, offer_expires_at")
    .in("slot_id", slotIds)
    .in("status", ["waiting", "offered"])
    .order("joined_at")
    .order("id");
  if (error) throw new Error(`loading slot queues failed: ${error.code}`);
  const names = await clientNames(
    supabase,
    data.map((row) => row.coaching_id),
  );
  for (const slotId of slotIds) {
    const rows = data.filter((row) => row.slot_id === slotId);
    if (rows.length === 0) continue;
    let place = 0;
    const entries = rows.map((row) => ({
      id: row.id,
      coachingId: row.coaching_id,
      name: names.get(row.coaching_id) ?? "",
      status: row.status as "waiting" | "offered",
      place: row.status === "waiting" ? ++place : null,
      offerExpiresAt: row.offer_expires_at,
    }));
    queues.set(slotId, [...entries.filter((entry) => entry.status === "offered"), ...entries.filter((entry) => entry.status === "waiting")]);
  }
  return queues;
}
