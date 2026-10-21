import "server-only";

import type { Locale } from "@/i18n/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isExerciseId } from "./catalog";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/** Exercise names in `locale`, else English, else the name it was created with; for ids the user can read. */
export async function exerciseNames(supabase: Supabase, ids: string[], locale: Locale): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  const names = new Map<string, string>();
  if (!unique.length) return names;
  const [exercises, translations] = await Promise.all([
    supabase.from("exercises").select("id, name").in("id", unique),
    supabase.from("exercise_translations").select("exercise_id, locale, name").in("exercise_id", unique).in("locale", [locale, "en"]),
  ]);
  for (const row of exercises.data ?? []) names.set(row.id, row.name);
  for (const row of (translations.data ?? []).filter((t) => t.locale === "en")) names.set(row.exercise_id, row.name);
  for (const row of (translations.data ?? []).filter((t) => t.locale === locale)) names.set(row.exercise_id, row.name);
  return names;
}

export type LogListItem = {
  id: string;
  title: string | null;
  performedAt: string;
  localDate: string;
  /** A pair log (from a session or written by the trainer), or the client's own. */
  fromPair: boolean;
  exercises: string[];
};

/** Logs per page of the list; "Показать ещё" loads the next page. */
export const LOG_PAGE = 50;

/** The last log shown: the next page starts right after it (newest first, ties by id). */
export type LogCursor = { performedAt: string; id: string };

/**
 * Logs of a client the signed-in user can read, newest first (RLS: the client sees all own logs, the trainer
 * the pair logs and, while shared, the self logs, PRD 2.10-10), a page at a time: `before` is the last log shown.
 */
export async function loadLogs(clientId: string, locale: Locale, before?: LogCursor): Promise<LogListItem[] | null> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("workout_logs")
    .select("id, title, performed_at, local_date, coaching_id, workout_log_exercises(exercise_id, position)")
    .eq("client_id", clientId);
  if (before) query = query.or(`performed_at.lt."${before.performedAt}",and(performed_at.eq."${before.performedAt}",id.lt.${before.id})`);
  const { data, error } = await query
    .order("performed_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(LOG_PAGE);
  if (error) {
    console.error("loading workout logs failed", error.code);
    return null;
  }
  const names = await exerciseNames(
    supabase,
    data.flatMap((log) => log.workout_log_exercises.map((e) => e.exercise_id)),
    locale,
  );
  return data.map((log) => ({
    id: log.id,
    title: log.title,
    performedAt: log.performed_at,
    localDate: log.local_date,
    fromPair: log.coaching_id !== null,
    exercises: [...log.workout_log_exercises].sort((a, b) => a.position - b.position).map((e) => names.get(e.exercise_id) ?? ""),
  }));
}

export type LogSet = {
  id: string;
  reps: number | null;
  weightKg: number | null;
  durationS: number | null;
  warmup: boolean;
  record: boolean;
};
export type LogDetails = {
  id: string;
  clientId: string;
  coachingId: string | null;
  bookingId: string | null;
  templateId: string | null;
  title: string | null;
  performedAt: string;
  localDate: string;
  durationMin: number | null;
  notes: string | null;
  /** Only the author edits, and a trainer only while the pair is live (PRD 2.10-10, 2.12-5). */
  editable: boolean;
  /** The client deletes any own log; the author trainer while the pair is live. */
  deletable: boolean;
  exercises: { exerciseId: string; name: string; notes: string | null; sets: LogSet[] }[];
};

/** One log the signed-in user can read, with its sets and which of them are the client's records (WORK-4). */
export async function loadLog(logId: string, locale: Locale): Promise<LogDetails | null> {
  if (!isExerciseId(logId)) return null;
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  const user = session?.claims.sub;
  if (!user) return null;
  const { data: log, error } = await supabase
    .from("workout_logs")
    .select(
      `id, client_id, coaching_id, booking_id, template_id, title, performed_at, local_date, duration_min, notes, created_by,
       workout_log_exercises(id, position, exercise_id, notes, workout_sets(id, position, reps, weight_kg, duration_s, is_warmup))`,
    )
    .eq("id", logId)
    .maybeSingle();
  if (error) console.error("loading a workout log failed", error.code);
  if (error || !log) return null;

  const setIds = log.workout_log_exercises.flatMap((e) => e.workout_sets.map((s) => s.id));
  const [names, records, pair] = await Promise.all([
    exerciseNames(
      supabase,
      log.workout_log_exercises.map((e) => e.exercise_id),
      locale,
    ),
    setIds.length
      ? supabase.from("visible_personal_records").select("set_id").eq("client_id", log.client_id).in("set_id", setIds)
      : Promise.resolve({ data: [] as { set_id: string | null }[] }),
    log.coaching_id ? supabase.from("coachings").select("status").eq("id", log.coaching_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const recordSets = new Set((records.data ?? []).map((r) => r.set_id));
  const live = !log.coaching_id || (pair.data !== null && pair.data.status !== "ended");
  const author = log.created_by === user;

  return {
    id: log.id,
    clientId: log.client_id,
    coachingId: log.coaching_id,
    bookingId: log.booking_id,
    templateId: log.template_id,
    title: log.title,
    performedAt: log.performed_at,
    localDate: log.local_date,
    durationMin: log.duration_min,
    notes: log.notes,
    editable: author && (log.client_id === user || live),
    deletable: log.client_id === user || (author && Boolean(log.coaching_id) && live),
    exercises: [...log.workout_log_exercises]
      .sort((a, b) => a.position - b.position)
      .map((e) => ({
        exerciseId: e.exercise_id,
        name: names.get(e.exercise_id) ?? "",
        notes: e.notes,
        sets: [...e.workout_sets]
          .sort((a, b) => a.position - b.position)
          .map((s) => ({
            id: s.id,
            reps: s.reps,
            weightKg: s.weight_kg,
            durationS: s.duration_s,
            warmup: s.is_warmup,
            record: recordSets.has(s.id),
          })),
      })),
  };
}

export type RecordItem = {
  exerciseId: string;
  name: string;
  type: "max_weight" | "max_reps" | "max_duration";
  value: number;
  achievedAt: string;
};

/** The client's bests over the sets the signed-in user can see (R43), by exercise name. */
export async function loadRecords(clientId: string, locale: Locale): Promise<RecordItem[] | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("visible_personal_records")
    .select("exercise_id, record_type, value, achieved_at")
    .eq("client_id", clientId);
  if (error) {
    console.error("loading records failed", error.code);
    return null;
  }
  const rows = data.filter((r) => r.exercise_id && r.record_type && r.value !== null && r.achieved_at);
  const names = await exerciseNames(
    supabase,
    rows.map((r) => r.exercise_id as string),
    locale,
  );
  return rows
    .map((r) => ({
      exerciseId: r.exercise_id as string,
      name: names.get(r.exercise_id as string) ?? "",
      type: r.record_type as RecordItem["type"],
      value: Number(r.value),
      achievedAt: r.achieved_at as string,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, locale) || a.type.localeCompare(b.type));
}

/** The pair as the workouts screens need it: the client and whether the trainer may still write logs. */
export async function loadWorkoutPair(
  coachingId: string,
): Promise<{ coachingId: string; clientId: string; trainerId: string; live: boolean; viewerIsTrainer: boolean } | null> {
  if (!isExerciseId(coachingId)) return null;
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  const user = session?.claims.sub;
  if (!user) return null;
  const { data } = await supabase.from("coachings").select("id, client_id, trainer_id, status").eq("id", coachingId).maybeSingle();
  if (!data) return null;
  return {
    coachingId: data.id,
    clientId: data.client_id,
    trainerId: data.trainer_id,
    live: data.status !== "ended",
    viewerIsTrainer: data.trainer_id === user,
  };
}

/** A booking of the pair to log a session for: when it started (the log's time). */
export async function loadBookingStart(bookingId: string, coachingId: string): Promise<string | null> {
  if (!isExerciseId(bookingId)) return null;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("bookings")
    .select("id, sessions(starts_at)")
    .eq("id", bookingId)
    .eq("coaching_id", coachingId)
    .maybeSingle();
  const session = data?.sessions as { starts_at: string } | { starts_at: string }[] | null | undefined;
  return (Array.isArray(session) ? session[0]?.starts_at : session?.starts_at) ?? null;
}

/** The signed-in user's time zone (user_settings), for "today" in the log editor. */
export async function viewerTimeZone(): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  const user = session?.claims.sub;
  if (!user) return "Europe/Moscow";
  const { data } = await supabase.from("user_settings").select("time_zone").eq("user_id", user).maybeSingle();
  return data?.time_zone ?? "Europe/Moscow";
}

/** The signed-in user's id, or null. */
export async function viewerId(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  return session?.claims.sub ?? null;
}
