"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { BookingActionResult } from "./actions";

const input = z.object({ bookingId: z.uuid(), title: z.string().trim().min(1).max(120) });

/**
 * "Подтвердить как разовое" on a request (PRD 2.6.4-6, 2.8-12): confirmed and made a single session in one step,
 * so «Запрос подтверждён» already says so. The session gets its own drop-in pass named `title`, reserved for it;
 * the payment is marked on that pass separately.
 */
export async function confirmRequestSingle(raw: { bookingId: string; title: string }): Promise<BookingActionResult> {
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { status: "error", error: "failed" };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("decide_booking", {
    p_booking_id: parsed.data.bookingId,
    p_accept: true,
    p_single: true,
    p_single_title: parsed.data.title,
  });
  if (error) {
    if (error.message === "request_not_found") return { status: "error", error: "request_not_found" };
    console.error("confirming a request as single failed", error.code);
    return { status: "error", error: "failed" };
  }
  refresh();
  return { status: "done" };
}
