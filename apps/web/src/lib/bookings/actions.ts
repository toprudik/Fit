"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isTrialToken } from "@/lib/trial-links/link";

/** RPC errors the booking screens explain in words; anything else is "failed". */
const KNOWN_ERRORS = [
  "slot_unavailable",
  "too_late",
  "request_not_found",
  "invalid_reason",
  "invite_invalid",
  "trainer_unavailable",
  "own_invite",
  "already_client",
  "trial_used",
  "plan_limit_reached",
  "session_full",
  "already_booked",
  "already_waiting",
  "seats_available",
  "waitlist_not_found",
  "offer_expired",
] as const;

export type BookingError = (typeof KNOWN_ERRORS)[number] | "failed";

function known(error: { message: string; code: string }, what: string): BookingError {
  const match = KNOWN_ERRORS.find((key) => key === error.message);
  if (match) return match;
  console.error(`${what} failed`, error.code);
  return "failed";
}

const id = z.uuid();

export type PreviewResult =
  | { status: "done"; confirmed: boolean; passTitle: string | null; sessionsLeft: number | null }
  | { status: "error"; error: BookingError };

/** The confirm sheet of /client/book: whether a pass or allowed debt covers the slot (data-model §3.5). */
export async function previewBooking(slotId: string): Promise<PreviewResult> {
  if (!id.safeParse(slotId).success) return { status: "error", error: "failed" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("booking_preview", { p_slot_id: slotId });
  if (error) return { status: "error", error: known(error, "previewing a booking") };
  const row = data[0];
  return {
    status: "done",
    confirmed: Boolean(row?.confirmed),
    passTitle: row?.pass_title ?? null,
    sessionsLeft: row?.sessions_left ?? null,
  };
}

export type BookResult = { status: "done"; bookingId: string; confirmed: boolean } | { status: "error"; error: BookingError };

/** "Записаться" or "Отправить запрос" (PRD 2.6.4): a confirmed booking or a request that holds the slot. */
export async function bookSlot(slotId: string): Promise<BookResult> {
  if (!id.safeParse(slotId).success) return { status: "error", error: "failed" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("book_slot", { p_slot_id: slotId });
  if (error) return { status: "error", error: known(error, "booking a slot") };
  refresh();
  return { status: "done", bookingId: data[0].booking_id, confirmed: data[0].status === "confirmed" };
}

/** "Отправить запрос" on a trial landing (PRD 2.3-5): the caller joins the trainer with a trial request on the slot. */
export async function bookTrial(token: string, slotId: string): Promise<BookResult> {
  if (!id.safeParse(slotId).success || !isTrialToken(token)) return { status: "error", error: "failed" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("book_trial", { p_token: token, p_slot_id: slotId });
  if (error) return { status: "error", error: known(error, "booking a trial") };
  refresh();
  return { status: "done", bookingId: data[0].booking_id, confirmed: false };
}

/** The confirm sheet for a group session: the same answer as for a slot. */
export async function previewGroupBooking(sessionId: string): Promise<PreviewResult> {
  if (!id.safeParse(sessionId).success) return { status: "error", error: "failed" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("group_booking_preview", { p_session_id: sessionId });
  if (error) return { status: "error", error: known(error, "previewing a group booking") };
  const row = data[0];
  return {
    status: "done",
    confirmed: Boolean(row?.confirmed),
    passTitle: row?.pass_title ?? null,
    sessionsLeft: row?.sessions_left ?? null,
  };
}

/** "Записаться" on a group session (PRD 2.6.4-1): a seat, confirmed or held by a request; session_full when the last one went. */
export async function bookGroupSession(sessionId: string): Promise<BookResult> {
  if (!id.safeParse(sessionId).success) return { status: "error", error: "failed" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("book_group_session", { p_session_id: sessionId });
  if (error) return { status: "error", error: known(error, "booking a group session") };
  refresh();
  return { status: "done", bookingId: data[0].booking_id, confirmed: data[0].status === "confirmed" };
}

export type BookingActionResult = { status: "done" } | { status: "error"; error: BookingError };

/** "Отозвать запрос" (PRD 2.6.5-6): no charge, the slot is free again. */
export async function withdrawRequest(bookingId: string): Promise<BookingActionResult> {
  if (!id.safeParse(bookingId).success) return { status: "error", error: "failed" };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("withdraw_booking_request", { p_booking_id: bookingId });
  if (error) return { status: "error", error: known(error, "withdrawing a request") };
  refresh();
  return { status: "done" };
}

/** The trainer confirms a request or declines it with an optional reason (PRD 2.6.4). */
export async function decideRequest(raw: { bookingId: string; accept: boolean; reason: string }): Promise<BookingActionResult> {
  const parsed = z.object({ bookingId: id, accept: z.boolean(), reason: z.string().trim().max(500) }).safeParse(raw);
  if (!parsed.success) return { status: "error", error: raw.reason?.length > 500 ? "invalid_reason" : "failed" };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("decide_booking", {
    p_booking_id: parsed.data.bookingId,
    p_accept: parsed.data.accept,
    ...(parsed.data.reason ? { p_reason: parsed.data.reason } : {}),
  });
  if (error) return { status: "error", error: known(error, "deciding a request") };
  refresh();
  return { status: "done" };
}

export type JoinWaitlistResult = { status: "done"; entryId: string; place: number } | { status: "error"; error: BookingError };

/** "В лист ожидания" on a full group session (PRD wave-2 §9.1): the caller's place in line. */
export async function joinWaitlist(sessionId: string): Promise<JoinWaitlistResult> {
  if (!id.safeParse(sessionId).success) return { status: "error", error: "failed" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("join_waitlist", { p_session_id: sessionId });
  if (error) return { status: "error", error: known(error, "joining a waitlist") };
  refresh();
  return { status: "done", entryId: data[0].entry_id, place: data[0].place };
}

/** "Выйти из очереди", or "Отказаться" from an offered seat, which then goes to the next in line. */
export async function leaveWaitlist(entryId: string): Promise<BookingActionResult> {
  if (!id.safeParse(entryId).success) return { status: "error", error: "failed" };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("leave_waitlist", { p_entry_id: entryId });
  if (error) return { status: "error", error: known(error, "leaving a waitlist") };
  refresh();
  return { status: "done" };
}

/** "Занять место": the offered seat becomes a booking, confirmed or a request (PRD wave-2 §9 rule 5). */
export async function acceptWaitlistOffer(entryId: string): Promise<BookResult> {
  if (!id.safeParse(entryId).success) return { status: "error", error: "failed" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("accept_waitlist_offer", { p_entry_id: entryId });
  if (error) return { status: "error", error: known(error, "accepting a waitlist offer") };
  refresh();
  return { status: "done", bookingId: data[0].booking_id, confirmed: data[0].status === "confirmed" };
}
