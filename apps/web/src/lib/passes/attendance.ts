"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AttendanceMark = "attended" | "no_show" | "cancelled";
export type AttendanceError = "not_started" | "reason_required" | "reason_too_long" | "invalid_status" | "failed";
export type AttendanceResult = { status: "done" } | { status: "error"; error: AttendanceError };

const KNOWN: AttendanceError[] = ["not_started", "reason_required", "reason_too_long", "invalid_status"];

/**
 * "Был", "Не пришёл" or "Не состоялось" (PRD 2.6.6, К6): the trainer marks a booking after the start. The database
 * charges once, keeps the charge through corrections between the first two and takes it back for "Не состоялось".
 */
export async function markAttendance(raw: { bookingId: string; mark: AttendanceMark; reason: string }): Promise<AttendanceResult> {
  const parsed = z
    .object({ bookingId: z.uuid(), mark: z.enum(["attended", "no_show", "cancelled"]), reason: z.string().trim().max(500) })
    .safeParse(raw);
  if (!parsed.success) return { status: "error", error: raw.reason?.length > 500 ? "reason_too_long" : "failed" };
  if (parsed.data.mark === "cancelled" && !parsed.data.reason) return { status: "error", error: "reason_required" };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("mark_attendance", {
    p_booking_id: parsed.data.bookingId,
    p_status: parsed.data.mark,
    ...(parsed.data.reason ? { p_reason: parsed.data.reason } : {}),
  });
  if (error) {
    const match = KNOWN.find((key) => key === error.message);
    if (match) return { status: "error", error: match };
    console.error("marking attendance failed", error.code);
    return { status: "error", error: "failed" };
  }
  refresh();
  return { status: "done" };
}
