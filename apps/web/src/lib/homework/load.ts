import "server-only";

import type { Locale } from "@/i18n/config";
import { DELETED_CLIENT_ID, displayName } from "@/lib/pairs/clients";
import { todayIn } from "@/lib/passes/present";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/database.types";
import { exerciseNames } from "@/lib/workouts/logs";
import { isHomeworkId, type Homework, type HomeworkOccurrence } from "./homework";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

const COLUMNS =
  "id, coaching_id, title, description, video_url, due_date, repeat_weekdays, repeat_until, archived_at, created_at, homework_occurrences(id, due_on, done_at, comment, workout_log_id), homework_exercises(position, exercise_id, prescription)";

type Row = Pick<
  Tables<"homework">,
  "id" | "coaching_id" | "title" | "description" | "video_url" | "due_date" | "repeat_weekdays" | "repeat_until" | "archived_at"
> & {
  homework_occurrences: Pick<Tables<"homework_occurrences">, "id" | "due_on" | "done_at" | "comment" | "workout_log_id">[];
  homework_exercises: Pick<Tables<"homework_exercises">, "position" | "exercise_id" | "prescription">[];
};

/** Exercise names of the rows in the viewer's language. */
async function namesOf(supabase: Supabase, rows: Row[], locale: Locale): Promise<Map<string, string>> {
  return exerciseNames(
    supabase,
    rows.flatMap((row) => row.homework_exercises.map((e) => e.exercise_id)),
    locale,
  );
}

function toHomework(row: Row, names: Map<string, string>): Homework {
  return {
    id: row.id,
    coachingId: row.coaching_id,
    title: row.title,
    description: row.description,
    videoUrl: row.video_url,
    dueDate: row.due_date,
    repeatWeekdays: row.repeat_weekdays,
    repeatUntil: row.repeat_until,
    archived: row.archived_at !== null,
    exercises: [...row.homework_exercises]
      .sort((a, b) => a.position - b.position)
      .map((e) => ({ exerciseId: e.exercise_id, name: names.get(e.exercise_id) ?? "", prescription: e.prescription })),
    occurrences: row.homework_occurrences
      .map((o) => ({ id: o.id, dueOn: o.due_on, doneAt: o.done_at, comment: o.comment, workoutLogId: o.workout_log_id }))
      .sort((a, b) => a.dueOn.localeCompare(b.dueOn)),
  };
}

/** The client's day for a pair (deadlines follow it); null when the viewer is not in the pair. */
async function pairToday(supabase: Supabase, coachingId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("homework_today", { p_coaching: coachingId });
  if (error) console.error("loading the client's day failed", error.code);
  return data ?? null;
}

/** Homework of one pair for its trainer, newest first, archived ones included (RLS: the pair's sides only). */
export async function loadPairHomework(coachingId: string, locale: Locale): Promise<{ today: string; homework: Homework[] } | null> {
  if (!isHomeworkId(coachingId)) return null;
  const supabase = await createSupabaseServerClient();
  const [today, rows] = await Promise.all([
    pairToday(supabase, coachingId),
    supabase.from("homework").select(COLUMNS).eq("coaching_id", coachingId).order("created_at", { ascending: false }),
  ]);
  if (rows.error) {
    console.error("loading homework failed", rows.error.code);
    return null;
  }
  if (!today) return null;
  const names = await namesOf(supabase, rows.data as Row[], locale);
  return { today, homework: (rows.data as Row[]).map((row) => toHomework(row, names)) };
}

/** One homework with its deadlines and the client's day, for the trainer's detail screen. */
export async function loadHomework(homeworkId: string, locale: Locale): Promise<{ today: string; homework: Homework } | null> {
  if (!isHomeworkId(homeworkId)) return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("homework").select(COLUMNS).eq("id", homeworkId).maybeSingle();
  if (error) console.error("loading a homework failed", error.code);
  if (!data) return null;
  const [today, names] = await Promise.all([pairToday(supabase, data.coaching_id), namesOf(supabase, [data as Row], locale)]);
  return today ? { today, homework: toHomework(data as Row, names) } : null;
}

export type ClientHomework = Homework & { trainer: string };

/**
 * "Домашние задания" of the client (screens.md /client/sessions/homework): the homework of every live pair
 * that is not archived, with the trainer's name. Null without a session.
 */
export async function loadClientHomework(locale: Locale): Promise<{ today: string; homework: ClientHomework[] } | null> {
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  const userId = session?.claims.sub;
  if (!userId) return null;
  const [pairs, settings] = await Promise.all([
    supabase.from("coachings").select("id, trainer_id").eq("client_id", userId).in("status", ["trial", "active"]),
    supabase.from("user_settings").select("time_zone").eq("user_id", userId).maybeSingle(),
  ]);
  if (pairs.error) throw new Error(`loading pairs failed: ${pairs.error.code}`);
  const today = todayIn(settings.data?.time_zone ?? "Europe/Moscow");
  if (!pairs.data.length) return { today, homework: [] };

  // telegram_id is not granted, so the columns are listed.
  const [rows, people] = await Promise.all([
    supabase
      .from("homework")
      .select(COLUMNS)
      .in(
        "coaching_id",
        pairs.data.map((pair) => pair.id),
      )
      .is("archived_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("profiles")
      .select("id, first_name, last_name, display_name, username")
      .in(
        "id",
        pairs.data.map((pair) => pair.trainer_id),
      ),
  ]);
  if (rows.error) throw new Error(`loading homework failed: ${rows.error.code}`);
  if (people.error) throw new Error(`loading trainers failed: ${people.error.code}`);
  const names = await namesOf(supabase, rows.data as Row[], locale);
  const trainerOf = new Map(pairs.data.map((pair) => [pair.id, pair.trainer_id]));
  const byId = new Map(people.data.map((person) => [person.id, person]));
  return {
    today,
    homework: (rows.data as Row[]).map((row) => ({
      ...toHomework(row, names),
      trainer: displayName(byId.get(trainerOf.get(row.coaching_id) ?? "")),
    })),
  };
}

/**
 * The pair as the homework screens need it: whether the viewer trains it, and whether homework can be given
 * (a live pair with a client who has an account; save_homework refuses the rest). Null outside the pair.
 */
export async function loadHomeworkPair(coachingId: string): Promise<{ viewerIsTrainer: boolean; canGive: boolean } | null> {
  if (!isHomeworkId(coachingId)) return null;
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  const userId = session?.claims.sub;
  if (!userId) return null;
  const { data } = await supabase.from("coachings").select("client_id, trainer_id, status").eq("id", coachingId).maybeSingle();
  if (!data) return null;
  const viewerIsTrainer = data.trainer_id === userId;
  if (!viewerIsTrainer || data.status === "ended" || data.client_id === DELETED_CLIENT_ID) return { viewerIsTrainer, canGive: false };
  const { data: client } = await supabase.from("profiles").select("managed_by_trainer_id").eq("id", data.client_id).maybeSingle();
  return { viewerIsTrainer, canGive: !client?.managed_by_trainer_id };
}

/** A deadline of the client's homework with its homework, for "Записать подходы"; null when it is not theirs. */
export async function loadClientOccurrence(
  occurrenceId: string,
  locale: Locale,
): Promise<{ homework: ClientHomework; occurrence: HomeworkOccurrence } | null> {
  if (!isHomeworkId(occurrenceId)) return null;
  const loaded = await loadClientHomework(locale);
  for (const homework of loaded?.homework ?? []) {
    const occurrence = homework.occurrences.find((o) => o.id === occurrenceId);
    if (occurrence) return { homework, occurrence };
  }
  return null;
}

/** Which of the logs linked to deadlines the viewer can open (a self log reaches the trainer only while shared). */
export async function visibleLogIds(ids: (string | null)[]): Promise<Set<string>> {
  const wanted = ids.filter((id): id is string => id !== null);
  if (!wanted.length) return new Set();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("workout_logs").select("id").in("id", wanted);
  if (error) console.error("loading homework logs failed", error.code);
  return new Set((data ?? []).map((row) => row.id));
}
