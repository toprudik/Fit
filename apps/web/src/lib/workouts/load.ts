import "server-only";

import type { Locale } from "@/i18n/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isExerciseId, type LibraryQuery } from "./catalog";

export type LibraryItem = {
  id: string;
  name: string;
  category: string | null;
  source: "wger" | "custom";
  own: boolean;
  equipment: string[];
};

export const LIBRARY_PAGE = 50;

/**
 * Exercises found by the library search as the signed-in user (RLS: the wger catalog, own exercises and those
 * of the user's trainers), named in `locale` or else in English. `isTrainer` lets the screen offer "own exercise".
 */
export async function loadLibrary(
  query: LibraryQuery,
  locale: Locale,
): Promise<{ status: "signed-out" } | { status: "failed" } | { status: "ok"; items: LibraryItem[]; isTrainer: boolean }> {
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  const user = session?.claims.sub;
  if (!user) return { status: "signed-out" };
  const [found, trainer] = await Promise.all([
    supabase.rpc("search_exercises", {
      p_query: query.q,
      p_locale: locale,
      p_category: query.category,
      p_own_only: query.own ?? false,
      p_limit: LIBRARY_PAGE,
    }),
    supabase.from("trainer_profiles").select("user_id").eq("user_id", user).maybeSingle(),
  ]);
  if (found.error || trainer.error) {
    console.error("loading the exercise library failed", (found.error ?? trainer.error)?.code);
    return { status: "failed" };
  }
  return {
    status: "ok",
    isTrainer: Boolean(trainer.data),
    items: (found.data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      category: row.category,
      source: row.source,
      own: row.own,
      equipment: row.equipment ?? [],
    })),
  };
}

export type ExerciseDetails = {
  id: string;
  source: "wger" | "custom";
  own: boolean;
  archived: boolean;
  /** In `locale`, else English, else the name it was created with. */
  name: string;
  description: string | null;
  /** What the owner typed, for the edit form: the name and description in the owner's own language. */
  baseName: string;
  category: string | null;
  musclesPrimary: string[];
  musclesSecondary: string[];
  equipment: string[];
  videoUrl: string | null;
  /** wger and copies of wger exercises: the license, authors and the page to credit (PRD 2.10-2). */
  attribution: { license: string; authors: string | null; url: string | null } | null;
  /** The viewer has a trainer profile: they may make an own copy (PRD 2.10-2). */
  viewerIsTrainer: boolean;
};

/** One exercise the signed-in user may read, or `null` (no such exercise, or hidden by RLS). */
export async function loadExercise(id: string, locale: Locale): Promise<ExerciseDetails | null> {
  if (!isExerciseId(id)) return null;
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  const user = session?.claims.sub;
  if (!user) return null;
  const [exercise, translations, trainer] = await Promise.all([
    supabase
      .from("exercises")
      .select(
        "id, source, owner_id, name, category, muscles_primary, muscles_secondary, equipment, video_url, license, license_author, source_url, archived_at",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.from("exercise_translations").select("locale, name, description").eq("exercise_id", id),
    supabase.from("trainer_profiles").select("user_id").eq("user_id", user).maybeSingle(),
  ]);
  const failed = exercise.error ?? translations.error ?? trainer.error;
  if (failed) {
    console.error("loading an exercise failed", failed.code);
    return null;
  }
  const row = exercise.data;
  if (!row) return null;
  const rows = translations.data ?? [];
  const local = rows.find((t) => t.locale === locale);
  const english = rows.find((t) => t.locale === "en");
  const own = row.source === "custom" && row.owner_id === user;
  // The owner's text: the translation whose name is the base name, else the one in the owner's language.
  const authored = rows.find((t) => t.name === row.name) ?? local ?? english;
  return {
    id: row.id,
    source: row.source,
    own,
    archived: row.archived_at !== null,
    name: local?.name ?? english?.name ?? row.name,
    description: local?.description ?? english?.description ?? authored?.description ?? null,
    baseName: row.name,
    category: row.category,
    musclesPrimary: row.muscles_primary,
    musclesSecondary: row.muscles_secondary,
    equipment: row.equipment,
    videoUrl: row.video_url,
    attribution: row.license ? { license: row.license, authors: row.license_author, url: row.source_url } : null,
    viewerIsTrainer: Boolean(trainer.data),
  };
}
