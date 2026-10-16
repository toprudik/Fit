"use server";

import { refresh } from "next/cache";
import { isPairId } from "@/lib/pairs/clients";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isValidOffsets, sortOffsets } from "./offsets";
import { isToggleType, shortTime } from "./types";

export type SettingsActionResult = { ok: boolean };

function done(what: string, error: { code: string } | null, rows?: unknown[] | null): SettingsActionResult {
  if (error) {
    console.error(`${what} failed`, error.code);
    return { ok: false };
  }
  // RLS hides rows the caller may not change, so a refused update touches none.
  if (rows && rows.length === 0) return { ok: false };
  refresh();
  return { ok: true };
}

async function signedIn() {
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  return { supabase, userId: session?.claims.sub ?? null };
}

/** The client's reminders for one trainer (PRD 2.9-2, 2.9-3); the database re-plans future bookings. */
export async function setPairReminders(input: { coachingId: string; offsets: number[] }): Promise<SettingsActionResult> {
  if (!isPairId(input.coachingId) || !isValidOffsets(input.offsets)) return { ok: false };
  const { supabase, userId } = await signedIn();
  if (!userId) return { ok: false };
  const { data, error } = await supabase
    .from("coachings")
    .update({ client_reminder_offsets: sortOffsets(input.offsets) })
    .eq("id", input.coachingId)
    .eq("client_id", userId)
    .select("id");
  return done("saving reminders", error, data);
}

/** The trainer's reminders for new clients; existing pairs keep theirs (NOTIF-2). */
export async function setDefaultReminders(offsets: number[]): Promise<SettingsActionResult> {
  if (!isValidOffsets(offsets)) return { ok: false };
  const { supabase, userId } = await signedIn();
  if (!userId) return { ok: false };
  const { data, error } = await supabase
    .from("trainer_profiles")
    .update({ default_client_reminder_offsets: sortOffsets(offsets) })
    .eq("user_id", userId)
    .select("user_id");
  return done("saving default reminders", error, data);
}

/** Quiet hours in the user's time zone, or off with null (PRD 2.9-7). */
export async function setQuietHours(hours: { start: string; end: string } | null): Promise<SettingsActionResult> {
  const start = hours ? shortTime(hours.start) : null;
  const end = hours ? shortTime(hours.end) : null;
  if (hours && (!start || !end || start === end)) return { ok: false };
  const { supabase, userId } = await signedIn();
  if (!userId) return { ok: false };
  const { data, error } = await supabase
    .from("user_settings")
    .update({ quiet_hours_start: start, quiet_hours_end: end })
    .eq("user_id", userId)
    .select("user_id");
  return done("saving quiet hours", error, data);
}

/** When the trainer daily digest leaves, in the user's time zone (PRD 2.9-6). */
export async function setDigestTime(time: string): Promise<SettingsActionResult> {
  const value = shortTime(time);
  if (!value) return { ok: false };
  const { supabase, userId } = await signedIn();
  if (!userId) return { ok: false };
  const { data, error } = await supabase.from("user_settings").update({ daily_digest_time: value }).eq("user_id", userId).select("user_id");
  return done("saving the digest time", error, data);
}

/**
 * Turns one notification type on or off (PRD 2.9-8, NOTIF-7). A row exists only for a type switched off;
 * turning it back on deletes the row, so the default applies again.
 */
export async function setNotificationEnabled(input: { type: string; enabled: boolean }): Promise<SettingsActionResult> {
  if (!isToggleType(input.type)) return { ok: false };
  const { supabase, userId } = await signedIn();
  if (!userId) return { ok: false };
  if (input.enabled) {
    const { error } = await supabase.from("notification_preferences").delete().eq("user_id", userId).eq("type", input.type);
    return done("turning a notification on", error);
  }
  const { error } = await supabase.from("notification_preferences").insert({ user_id: userId, type: input.type, enabled: false });
  // Already off: the row is there.
  if (error?.code === "23505") return done("turning a notification off", null);
  return done("turning a notification off", error);
}
