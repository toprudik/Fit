"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { loadScheduleOwner } from "@/lib/schedule/load";
import { DURATIONS } from "@/lib/schedule/template";
import { localToUtc, parseMinutes } from "@/lib/schedule/time";

export type AssistedSessionResult = { ok: true } | { ok: false; reason: "past" | "link" | "denied" | "failed" };

const input = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("offline"),
    coachingId: z.uuid(),
    day: z.iso.date(),
    time: z.string().regex(/^\d{2}:\d{2}$/),
    durationMin: z.number().refine((value) => (DURATIONS as readonly number[]).includes(value)),
    locationId: z.uuid().nullable(),
  }),
  z.object({
    mode: z.literal("online"),
    coachingId: z.uuid(),
    day: z.iso.date(),
    time: z.string().regex(/^\d{2}:\d{2}$/),
    durationMin: z.number().refine((value) => (DURATIONS as readonly number[]).includes(value)),
    meetingUrl: z.string().trim().max(500).nullable(),
  }),
]);

/**
 * A personal session of a delegated client, created by an assistant with the schedule scope (PRD wave-3 §1
 * rule 3). Day and time are on the assistant's clock (user_settings), like every time on its card. The session
 * stays the owner's; create_session checks the delegation and records the assistant.
 */
export async function createAssistedSession(raw: z.input<typeof input>): Promise<AssistedSessionResult> {
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "failed" };
  const value = parsed.data;
  const me = await loadScheduleOwner();
  const minutes = parseMinutes(value.time);
  if (!me || minutes === null) return { ok: false, reason: "failed" };
  const startsAt = localToUtc(value.day, minutes, me.timeZone);
  if (startsAt.getTime() <= Date.now()) return { ok: false, reason: "past" };
  const { error } = await me.supabase.rpc("create_session", {
    p_coaching_id: value.coachingId,
    p_starts_at: startsAt.toISOString(),
    p_duration_min: value.durationMin,
    p_mode: value.mode,
    ...(value.mode === "offline" && value.locationId ? { p_location_id: value.locationId } : {}),
    ...(value.mode === "online" && value.meetingUrl ? { p_meeting_url: value.meetingUrl } : {}),
  });
  if (error) {
    if (error.message === "in_past") return { ok: false, reason: "past" };
    if (error.message === "invalid_link") return { ok: false, reason: "link" };
    if (error.code === "42501") return { ok: false, reason: "denied" };
    console.error("creating an assisted session failed", error.code);
    return { ok: false, reason: "failed" };
  }
  refresh();
  return { ok: true };
}
