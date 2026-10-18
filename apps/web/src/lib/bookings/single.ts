"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { decideRequest, type BookingActionResult } from "./actions";

const input = z.object({ bookingId: z.uuid(), title: z.string().trim().min(1).max(120) });

export type SingleResult = BookingActionResult | { status: "error"; error: "single_failed" };

/**
 * Marks a confirmed future booking as a single session (PRD wave-1 §2.8-12): its own drop-in pass at the
 * drop-in price, reserved for it; the payment is marked on that pass separately. `title` names the pass.
 */
export async function makeBookingSingle(raw: { bookingId: string; title: string }): Promise<SingleResult> {
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { status: "error", error: "single_failed" };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("make_booking_single", { p_booking_id: parsed.data.bookingId, p_title: parsed.data.title });
  if (error) {
    console.error("making a booking single failed", error.code);
    return { status: "error", error: "single_failed" };
  }
  refresh();
  return { status: "done" };
}

/** "Подтвердить как разовое" on a request (PRD 2.6.4-6): confirms it, then makes it a single session. */
export async function confirmRequestSingle(raw: { bookingId: string; title: string }): Promise<SingleResult> {
  const confirmed = await decideRequest({ bookingId: raw.bookingId, accept: true, reason: "" });
  if (confirmed.status === "error") return confirmed;
  return makeBookingSingle(raw);
}
