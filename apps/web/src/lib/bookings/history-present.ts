import type { Database } from "@/lib/supabase/database.types";

type BookingStatus = Database["public"]["Enums"]["booking_status"];
export type ActorRole = Database["public"]["Enums"]["actor_role"];

/** What one booking_events row did, for «История записи» (PRD wave-1 SCHED-22). */
export type BookingChange =
  | "requested"
  | "booked"
  | "confirmed"
  | "declined"
  | "expired"
  | "cancelled"
  | "lateCancelled"
  | "rescheduled"
  | "attended"
  | "noShow"
  | "remarked"
  | "forgiven"
  | "changed";

export type BookingEventRow = {
  from: BookingStatus | null;
  to: BookingStatus;
  payload: Record<string, unknown>;
};

const MARKS: ReadonlySet<BookingStatus> = new Set(["attended", "no_show", "late_cancelled"]);

/** Names the change of a booking_events row; a waiver keeps the status and only forgives the charge. */
export function bookingChange({ from, to, payload }: BookingEventRow): BookingChange {
  if (payload.waiver_id) return "forgiven";
  if (from === null) return to === "confirmed" ? "booked" : "requested";
  if (from === to) return "changed";
  if (MARKS.has(from) && (to === "attended" || to === "no_show")) return "remarked";
  switch (to) {
    case "confirmed":
      return "confirmed";
    case "declined":
      return "declined";
    case "expired":
      return "expired";
    case "cancelled":
      return "cancelled";
    case "late_cancelled":
      return "lateCancelled";
    case "rescheduled":
      return "rescheduled";
    case "attended":
      return "attended";
    case "no_show":
      return "noShow";
    default:
      return "changed";
  }
}
