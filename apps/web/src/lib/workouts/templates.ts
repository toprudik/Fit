import "server-only";

import type { Locale } from "@/i18n/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isExerciseId } from "./catalog";
import { exerciseNames } from "./logs";
import type { TemplateItem } from "./template";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export type TemplateListItem = { id: string; title: string; archived: boolean; exercises: number };

/** The signed-in trainer's templates, by title; RLS shows only their own (PRD wave-1 §2.10-7). */
export async function loadTemplates(): Promise<TemplateListItem[] | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("workout_templates")
    .select("id, title, archived_at, workout_template_items(count)")
    .order("title");
  if (error) {
    console.error("loading workout templates failed", error.code);
    return null;
  }
  return data.map((row) => ({
    id: row.id,
    title: row.title,
    archived: row.archived_at !== null,
    exercises: row.workout_template_items[0]?.count ?? 0,
  }));
}

export type TemplateDetails = { id: string; title: string; notes: string | null; archived: boolean; items: TemplateItem[] };

/** One template with its exercises in order and their names in `locale`. */
export async function loadTemplate(id: string, locale: Locale, client?: Supabase): Promise<TemplateDetails | null> {
  if (!isExerciseId(id)) return null;
  const supabase = client ?? (await createSupabaseServerClient());
  const { data, error } = await supabase
    .from("workout_templates")
    .select(
      `id, title, notes, archived_at,
       workout_template_items(position, exercise_id, target_sets, target_reps, target_weight_kg, target_duration_s, rest_s)`,
    )
    .eq("id", id)
    .maybeSingle();
  if (error) console.error("loading a workout template failed", error.code);
  if (error || !data) return null;
  const items = [...data.workout_template_items].sort((a, b) => a.position - b.position);
  const names = await exerciseNames(
    supabase,
    items.map((item) => item.exercise_id),
    locale,
  );
  return {
    id: data.id,
    title: data.title,
    notes: data.notes,
    archived: data.archived_at !== null,
    items: items.map((item) => ({
      exerciseId: item.exercise_id,
      name: names.get(item.exercise_id) ?? "",
      targetSets: item.target_sets,
      targetReps: item.target_reps,
      targetWeightKg: item.target_weight_kg === null ? null : Number(item.target_weight_kg),
      targetDurationS: item.target_duration_s,
      restS: item.rest_s,
    })),
  };
}
