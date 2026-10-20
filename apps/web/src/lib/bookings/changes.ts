"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { BookResult, PreviewResult } from "./actions";

const id = z.uuid();

export type CancelError = "late_cancel" | "booking_not_found" | "invalid_reason" | "failed";
export type CancelResult = { status: "done"; late: boolean } | { status: "error"; error: CancelError };

/**
 * "Отменить запись" (PRD 2.6.5): free before the trainer's deadline. Past it the server answers late_cancel until the
 * client agrees to the charge with `late`.
 */
export async function cancelBooking(raw: { bookingId: string; reason: string; late: boolean }): Promise<CancelResult> {
  const parsed = z.object({ bookingId: id, reason: z.string().trim().max(500), late: z.boolean() }).safeParse(raw);
  if (!parsed.success) return { status: "error", error: raw.reason?.length > 500 ? "invalid_reason" : "failed" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("cancel_my_booking", {
    p_booking_id: parsed.data.bookingId,
    p_late: parsed.data.late,
    ...(parsed.data.reason ? { p_reason: parsed.data.reason } : {}),
  });
  if (error) {
    if (error.message === "late_cancel" || error.message === "booking_not_found" || error.message === "invalid_reason") {
      return { status: "error", error: error.message };
    }
    console.error("cancelling a booking failed", error.code);
    return { status: "error", error: "failed" };
  }
  refresh();
  return { status: "done", late: data === "late_cancelled" };
}

/** What a late cancellation would take: a session of a pass, debt at the drop-in price, or nothing (a free trial). */
export type CancelCharge =
  | { kind: "pass"; passTitle: string; sessionsLeft: number }
  | { kind: "debt"; amountMinor: number; currency: string }
  | { kind: "free" };

/** The late-cancel sheet names the charge before the client agrees (screens.md §4.3); null when unknown. */
export async function previewCancel(bookingId: string): Promise<CancelCharge | null> {
  if (!id.safeParse(bookingId).success) return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("cancel_preview", { p_booking_id: bookingId });
  const row = data?.[0];
  if (error || !row) {
    if (error) console.error("previewing a cancellation failed", error.code);
    return null;
  }
  if (!row.charged) return { kind: "free" };
  if (row.pass_title) return { kind: "pass", passTitle: row.pass_title, sessionsLeft: Math.max(row.sessions_left ?? 0, 0) };
  if (row.debt_minor && row.currency) return { kind: "debt", amountMinor: row.debt_minor, currency: row.currency };
  return null;
}

/** Errors of a move, in the words of the booking picker: a closed deadline reads as "too late". */
function moveError(error: { message: string; code: string }, what: string) {
  if (error.message === "slot_unavailable") return "slot_unavailable" as const;
  if (error.message === "deadline_passed" || error.message === "too_late") return "too_late" as const;
  if (error.message === "debt_limit") return "debt_limit" as const;
  console.error(`${what} failed`, error.code);
  return "failed" as const;
}

/** The confirm sheet of a move: what pays for the new time once the old booking lets its pass go. */
export async function previewReschedule(bookingId: string, slotId: string): Promise<PreviewResult> {
  if (!id.safeParse(bookingId).success || !id.safeParse(slotId).success) return { status: "error", error: "failed" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("reschedule_preview", { p_booking_id: bookingId, p_slot_id: slotId });
  if (error) return { status: "error", error: moveError(error, "previewing a move") };
  const row = data[0];
  return {
    status: "done",
    confirmed: Boolean(row?.confirmed),
    passTitle: row?.pass_title ?? null,
    sessionsLeft: row?.sessions_left ?? null,
  };
}

/** "Перенести" (PRD 2.6.5): the old booking becomes "Перенесено" and the new time is booked like a fresh one. */
export async function rescheduleBooking(bookingId: string, slotId: string): Promise<BookResult> {
  if (!id.safeParse(bookingId).success || !id.safeParse(slotId).success) return { status: "error", error: "failed" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("reschedule_my_booking", { p_booking_id: bookingId, p_slot_id: slotId });
  if (error) return { status: "error", error: moveError(error, "moving a booking") };
  refresh();
  return { status: "done", bookingId: data[0].booking_id, confirmed: data[0].status === "confirmed" };
}
