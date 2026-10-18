"use server";

import { z } from "zod";
import { DEFAULT_TIME_ZONE } from "@/lib/plans/plans";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { addDays, localInstant } from "./present";

const input = z
  .object({ passId: z.uuid(), from: z.iso.date(), to: z.iso.date() })
  .refine((value) => value.to >= value.from);

/**
 * How many confirmed sessions of the pass's pair fall on the days of a freeze being set (PRD wave-1 §2.8, edge
 * cases), so the trainer is warned before freezing: those bookings stay, but this pass does not pay for them.
 * Only sessions ahead count, on local days of the trainer's time zone; 0 when none or the pass is not readable.
 */
export async function freezeOverlap(raw: { passId: string; from: string; to: string }): Promise<number> {
  const parsed = input.safeParse(raw);
  if (!parsed.success) return 0;
  const { passId, from, to } = parsed.data;
  const supabase = await createSupabaseServerClient();
  const [{ data: pass }, { data: claims }] = await Promise.all([
    supabase.from("passes").select("coaching_id").eq("id", passId).maybeSingle(),
    supabase.auth.getClaims(),
  ]);
  const userId = claims?.claims.sub;
  if (!pass || !userId) return 0;
  const { data: profile } = await supabase.from("profiles").select("time_zone").eq("id", userId).maybeSingle();
  const timeZone = profile?.time_zone ?? DEFAULT_TIME_ZONE;
  const { data: bookings, error } = await supabase.from("bookings").select("session_id").eq("coaching_id", pass.coaching_id).eq("status", "confirmed");
  if (error || !bookings?.length) return 0;
  const { count } = await supabase
    .from("sessions")
    .select("id", { count: "exact", head: true })
    .in(
      "id",
      bookings.map((booking) => booking.session_id),
    )
    .gte("starts_at", localInstant(from, "00:00", timeZone))
    .gt("starts_at", new Date().toISOString())
    .lt("starts_at", localInstant(addDays(to, 1), "00:00", timeZone));
  return count ?? 0;
}
