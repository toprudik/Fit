import type { ClientBookingDetail } from "./load";

/**
 * Why a booking cannot be moved, so the move screen says what really happened (QA B6): it was moved already, it
 * was cancelled or is over, the free deadline passed, or the booking is a kind that never moves (a trial or a
 * group). Null when it can be moved.
 */
export type MoveBlock = "not_found" | "moved" | "closed" | "late" | "fixed";

export function moveBlock(
  booking: Pick<ClientBookingDetail, "status" | "kind" | "source" | "freeCancelUntil"> | null,
  at: Date,
): MoveBlock | null {
  if (!booking) return "not_found";
  if (booking.status === "rescheduled") return "moved";
  if (booking.status !== "confirmed") return "closed";
  if (booking.kind !== "personal" || booking.source === "trial") return "fixed";
  if (booking.freeCancelUntil === null || booking.freeCancelUntil < at.toISOString()) return "late";
  return null;
}
