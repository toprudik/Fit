"use server";

import { refresh } from "next/cache";
import { isLocale, type Locale } from "@/i18n/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isCategory, isExerciseId } from "./catalog";
import type { LogPayload } from "./log";

export type SaveLogResult = { ok: true; id: string } | { ok: false; reason: "forbidden" | "failed" };

/**
 * Saves a whole workout log (PRD wave-1 §2.10-4) through `save_workout_log`, as the user: RLS lets a client
 * write self logs and the trainer of a live pair that pair's logs, and only the author edit (2.10-10).
 */
export async function saveWorkoutLog(payload: LogPayload): Promise<SaveLogResult> {
  if (!isExerciseId(payload.client_id) || (payload.id !== undefined && !isExerciseId(payload.id))) return { ok: false, reason: "failed" };
  if (!payload.exercises.every((e) => isExerciseId(e.exercise_id))) return { ok: false, reason: "failed" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("save_workout_log", { p_log: payload });
  if (error) {
    console.error("saving a workout log failed", error.code);
    return { ok: false, reason: error.code === "42501" || error.code === "P0002" ? "forbidden" : "failed" };
  }
  refresh();
  return { ok: true, id: data };
}

/** Deletes a log: the client any own log, the author trainer while the pair is live (RLS). */
export async function deleteWorkoutLog(logId: string): Promise<{ ok: boolean }> {
  if (!isExerciseId(logId)) return { ok: false };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("workout_logs").delete().eq("id", logId).select("id");
  if (error) console.error("deleting a workout log failed", error.code);
  return { ok: !error && data.length > 0 };
}

export type ExerciseHit = { id: string; name: string; category: string | null; own: boolean };

/** The exercise picker of the log editor: the library search as the user (PRD 2.10-1..3). */
export async function findExercises(input: { query: string; locale: Locale; category?: string }): Promise<ExerciseHit[]> {
  if (!isLocale(input.locale)) return [];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("search_exercises", {
    p_query: input.query.slice(0, 100),
    p_locale: input.locale,
    p_category: isCategory(input.category) ? input.category : undefined,
    p_limit: 30,
  });
  if (error) console.error("searching exercises failed", error.code);
  return (data ?? []).map((row) => ({ id: row.id, name: row.name, category: row.category, own: row.own }));
}

export type LastResult = {
  exerciseId: string;
  performedAt: string;
  sets: { reps: number | null; weightKg: number | null; durationS: number | null }[];
};

/** "В прошлый раз" for each exercise (PRD 2.10-5, WORK-3): the latest log before `before` the user can read. */
export async function lastResults(input: { clientId: string; exerciseIds: string[]; before?: string }): Promise<LastResult[]> {
  if (!isExerciseId(input.clientId) || !input.exerciseIds.every(isExerciseId) || !input.exerciseIds.length) return [];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("last_exercise_results", {
    p_client: input.clientId,
    p_exercises: input.exerciseIds.slice(0, 30),
    p_before: input.before,
  });
  if (error) console.error("loading last results failed", error.code);
  return (data ?? []).map((row) => ({
    exerciseId: row.exercise_id,
    performedAt: row.performed_at,
    sets: ((row.sets ?? []) as { reps: number | null; weight_kg: number | null; duration_s: number | null; is_warmup: boolean }[])
      .filter((s) => !s.is_warmup)
      .map((s) => ({ reps: s.reps, weightKg: s.weight_kg, durationS: s.duration_s })),
  }));
}
