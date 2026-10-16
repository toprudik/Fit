"use server";

import { refresh } from "next/cache";
import { isLocale, type Locale } from "@/i18n/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  EQUIPMENT,
  EXERCISE_DESCRIPTION_MAX_LENGTH,
  EXERCISE_NAME_MAX_LENGTH,
  isCategory,
  isExerciseId,
  MUSCLES,
  normalizeVideoUrl,
} from "./catalog";

export type ExerciseInput = {
  /** Set to edit an own exercise; left out to create one. */
  id?: string;
  /** The language the name and description are written in: the user's interface language. */
  locale: Locale;
  /** Create only: the exercise this one is based on; a wger source keeps its license and authors (PRD 2.10-2). */
  basedOn?: string;
  name: string;
  category: string;
  muscles: string[];
  equipment: string[];
  description: string;
  videoUrl: string;
};

export type ExerciseActionResult =
  | { ok: true; id: string }
  | { ok: false; reason: "invalid"; fields: ("name" | "category" | "description" | "videoUrl")[] }
  | { ok: false; reason: "failed" };

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

const pick = <T extends string>(values: string[], allowed: readonly T[]): T[] => allowed.filter((key) => values.includes(key));

/** The name and description in the caller's language: updated in place, else added. */
async function saveTranslation(supabase: Supabase, exerciseId: string, locale: Locale, name: string, description: string | null) {
  const updated = await supabase
    .from("exercise_translations")
    .update({ name, description })
    .eq("exercise_id", exerciseId)
    .eq("locale", locale)
    .select("exercise_id");
  if (updated.error) return updated.error;
  if (updated.data.length > 0) return null;
  const inserted = await supabase.from("exercise_translations").insert({ exercise_id: exerciseId, locale, name, description });
  return inserted.error;
}

/**
 * "Своё упражнение" (PRD wave-1 §2.10-1): a trainer creates or edits an exercise of their own, seen only by
 * them and their clients (WORK-2). Writes go through the user's client: RLS keeps them to the caller's rows.
 */
export async function saveExercise(input: ExerciseInput): Promise<ExerciseActionResult> {
  const name = input.name.trim();
  const description = input.description.trim();
  const videoUrl = normalizeVideoUrl(input.videoUrl);
  const fields: ("name" | "category" | "description" | "videoUrl")[] = [];
  if (!name || name.length > EXERCISE_NAME_MAX_LENGTH) fields.push("name");
  if (!isCategory(input.category)) fields.push("category");
  if (description.length > EXERCISE_DESCRIPTION_MAX_LENGTH) fields.push("description");
  if (videoUrl === undefined) fields.push("videoUrl");
  if (fields.length) return { ok: false, reason: "invalid", fields };
  if (!isLocale(input.locale)) return { ok: false, reason: "failed" };
  if ((input.id !== undefined && !isExerciseId(input.id)) || (input.basedOn !== undefined && !isExerciseId(input.basedOn))) {
    return { ok: false, reason: "failed" };
  }

  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  const user = session?.claims.sub;
  if (!user) return { ok: false, reason: "failed" };

  const fieldsToSave = {
    name,
    category: input.category,
    muscles_primary: pick(input.muscles, MUSCLES),
    equipment: pick(input.equipment, EQUIPMENT),
    video_url: videoUrl ?? null,
  };

  let id = input.id;
  if (id) {
    const { data, error } = await supabase.from("exercises").update(fieldsToSave).eq("id", id).eq("owner_id", user).select("id");
    if (error || data.length === 0) {
      if (error) console.error("updating an exercise failed", error.code);
      return { ok: false, reason: "failed" };
    }
  } else {
    // A copy of a wger exercise credits wger like the original (CC-BY-SA keeps the attribution).
    let credit: { license: string | null; license_author: string | null; source_url: string | null; muscles_secondary: string[] } | null =
      null;
    if (input.basedOn) {
      const { data } = await supabase
        .from("exercises")
        .select("license, license_author, source_url, muscles_secondary")
        .eq("id", input.basedOn)
        .maybeSingle();
      credit = data;
    }
    const { data, error } = await supabase
      .from("exercises")
      .insert({
        source: "custom",
        owner_id: user,
        ...fieldsToSave,
        license: credit?.license ?? null,
        license_author: credit?.license_author ?? null,
        source_url: credit?.source_url ?? null,
        muscles_secondary: (credit?.muscles_secondary ?? []).filter((m) => !(fieldsToSave.muscles_primary as string[]).includes(m)),
      })
      .select("id")
      .single();
    if (error) {
      console.error("creating an exercise failed", error.code);
      return { ok: false, reason: "failed" };
    }
    id = data.id;
  }

  const translationError = await saveTranslation(supabase, id, input.locale, name, description || null);
  if (translationError) {
    console.error("saving an exercise translation failed", translationError.code);
    return { ok: false, reason: "failed" };
  }
  refresh();
  return { ok: true, id };
}

/** Moves an own exercise out of the library or back; logs and templates keep showing it (data-model §1.6). */
export async function setExerciseArchived(input: { id: string; archived: boolean }): Promise<{ ok: boolean }> {
  if (!isExerciseId(input.id)) return { ok: false };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("exercises")
    .update({ archived_at: input.archived ? new Date().toISOString() : null })
    .eq("id", input.id)
    .eq("source", "custom")
    .select("id");
  if (error) console.error("archiving an exercise failed", error.code);
  if (error || data.length === 0) return { ok: false };
  refresh();
  return { ok: true };
}
