import "server-only";
import { bookingChange, type ActorRole, type BookingChange } from "@/lib/bookings/history-present";
import { displayName } from "@/lib/pairs/clients";
import type { ScheduleOwner } from "@/lib/schedule/load";

export type BookingHistoryItem = {
  id: number;
  bookingId: string;
  change: BookingChange;
  role: ActorRole;
  /** The actor's name when the viewer may read it; otherwise the role speaks for them. */
  actor: string | null;
  at: string;
  reason: string | null;
};

/**
 * «История записи» (PRD wave-1 SCHED-22): every change of the bookings with who made it, when and why, oldest
 * first. booking_events is readable exactly where its booking is, so a viewer gets only their own bookings' rows.
 */
export async function loadBookingHistory(owner: ScheduleOwner, bookingIds: string[]): Promise<BookingHistoryItem[]> {
  const { supabase } = owner;
  if (bookingIds.length === 0) return [];
  const { data, error } = await supabase
    .from("booking_events")
    .select("id, booking_id, from_status, to_status, actor_id, actor_role, reason, created_at, payload")
    .in("booking_id", bookingIds)
    .order("id");
  if (error) throw new Error(`loading the booking history failed: ${error.code}`);

  const actorIds = [...new Set(data.map((row) => row.actor_id).filter((id): id is string => Boolean(id)))];
  const people = actorIds.length
    ? await supabase.from("profiles").select("id, first_name, last_name, display_name, username").in("id", actorIds)
    : { data: [] };
  const names = new Map((people.data ?? []).map((person) => [person.id, displayName(person)]));

  return data.map((row) => ({
    id: row.id,
    bookingId: row.booking_id,
    change: bookingChange({
      from: row.from_status,
      to: row.to_status,
      payload: row.payload && typeof row.payload === "object" && !Array.isArray(row.payload) ? row.payload : {},
    }),
    role: row.actor_role,
    actor: (row.actor_id && names.get(row.actor_id)) || null,
    at: row.created_at,
    reason: row.reason,
  }));
}
