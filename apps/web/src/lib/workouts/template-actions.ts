"use server";

import { refresh } from "next/cache";
import { isLocale, type Locale } from "@/i18n/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isExerciseId } from "./catalog";
import type { TemplateItem, TemplatePayload } from "./template";
import { loadTemplate, loadTemplates } from "./templates";

export type SaveTemplateResult = { ok: true; id: string } | { ok: false };

/** Saves a whole template through `save_workout_template`, as the trainer (PRD wave-1 §2.10-7). */
export async function saveWorkoutTemplate(payload: TemplatePayload): Promise<SaveTemplateResult> {
  if ((payload.id !== undefined && !isExerciseId(payload.id)) || !payload.items.every((i) => isExerciseId(i.exercise_id))) {
    return { ok: false };
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("save_workout_template", { p_template: payload });
  if (error) {
    console.error("saving a workout template failed", error.code);
    return { ok: false };
  }
  refresh();
  return { ok: true, id: data };
}

/** Archives a template or brings it back; the owner only (RLS). */
export async function setTemplateArchived(input: { id: string; archived: boolean }): Promise<{ ok: boolean }> {
  if (!isExerciseId(input.id)) return { ok: false };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("workout_templates")
    .update({ archived_at: input.archived ? new Date().toISOString() : null })
    .eq("id", input.id)
    .select("id");
  if (error) console.error("archiving a workout template failed", error.code);
  if (!error) refresh();
  return { ok: !error && data.length > 0 };
}

/** The picker of "Из шаблона" in the log editor: the trainer's templates that are not archived. */
export async function pickableTemplates(): Promise<{ id: string; title: string; exercises: number }[]> {
  const templates = await loadTemplates();
  return (templates ?? []).filter((t) => !t.archived && t.exercises > 0).map(({ id, title, exercises }) => ({ id, title, exercises }));
}

/** A template's exercises and plan, to fill a new log with (WORK-5). */
export async function templateForLog(input: { id: string; locale: Locale }): Promise<{ title: string; items: TemplateItem[] } | null> {
  if (!isLocale(input.locale)) return null;
  const template = await loadTemplate(input.id, input.locale);
  return template ? { title: template.title, items: template.items } : null;
}
