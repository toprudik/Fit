"use server";

import { refresh } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { STEPS_MAX, WATER_ML_MAX } from "./activity";

export type ActivityResult = { ok: true } | { ok: false; reason: "bad_day" | "failed" };

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function failed(error: { code?: string; message?: string }, what: string): ActivityResult {
  if (error.message === "bad_day") return { ok: false, reason: "bad_day" };
  console.error(`${what} failed`, error.code);
  return { ok: false, reason: "failed" };
}

/** Steps typed for a day (null clears them, and the iOS steps show again; wave-2 §4.3). */
export async function setSteps(input: { day: string; steps: number | null }): Promise<ActivityResult> {
  const { day, steps } = input;
  if (!DAY.test(day) || (steps !== null && (!Number.isInteger(steps) || steps < 0 || steps > STEPS_MAX))) {
    return { ok: false, reason: "failed" };
  }
  const supabase = await createSupabaseServerClient();
  // Null clears the value; the generated types have no null for a parameter without a default.
  const { error } = await supabase.rpc("set_activity", { p_day: day, p_metric: "steps", p_value: steps as number });
  if (error) return failed(error, "saving steps");
  refresh();
  return { ok: true };
}

/** Sleep for the day of waking up, in minutes, with an optional quality 1–5 (wave-2 §4.6). */
export async function setSleep(input: { day: string; minutes: number | null; quality: number | null }): Promise<ActivityResult> {
  const { day, minutes, quality } = input;
  if (
    !DAY.test(day) ||
    (minutes !== null && (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440)) ||
    (quality !== null && (!Number.isInteger(quality) || quality < 1 || quality > 5))
  ) {
    return { ok: false, reason: "failed" };
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_activity", {
    p_day: day,
    p_metric: "sleep",
    p_value: minutes as number,
    p_quality: quality ?? undefined,
  });
  if (error) return failed(error, "saving sleep");
  refresh();
  return { ok: true };
}

/** "+250 мл", "+500 мл" or a typed amount (wave-2 §4.5). */
export async function addWater(input: { day: string; ml: number }): Promise<ActivityResult> {
  if (!DAY.test(input.day) || !Number.isInteger(input.ml) || input.ml < 1 || input.ml > WATER_ML_MAX) {
    return { ok: false, reason: "failed" };
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("add_water", { p_day: input.day, p_ml: input.ml });
  if (error) return failed(error, "adding water");
  refresh();
  return { ok: true };
}

/** Takes back the latest water of the day. */
export async function undoWater(day: string): Promise<ActivityResult> {
  if (!DAY.test(day)) return { ok: false, reason: "failed" };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("undo_water", { p_day: day });
  if (error) return failed(error, "undoing water");
  refresh();
  return { ok: true };
}

/** A new iOS Shortcuts token, shown once; the previous one stops working at once (wave-2 §4.3). */
export async function issueShortcutToken(): Promise<{ ok: true; token: string } | { ok: false }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("issue_ingest_token");
  if (error || !data) {
    console.error("issuing a shortcut token failed", error?.code);
    return { ok: false };
  }
  return { ok: true, token: data };
}

export async function revokeShortcutToken(): Promise<{ ok: boolean }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("revoke_ingest_token");
  if (error) {
    console.error("revoking a shortcut token failed", error.code);
    return { ok: false };
  }
  refresh();
  return { ok: true };
}
