import { paidAtFor } from "@/lib/passes/present";
import { parseDay } from "@/lib/schedule/time";
import { formatDuration, fromKg, parseAmount, parseDuration, toKg, type WeightUnit } from "./units";

/**
 * The log editor's model (PRD wave-1 §2.10-4): what the fields hold as typed, and the payload of
 * `save_workout_log` built from it. Sets keep the raw text so a half-typed "12," stays on screen.
 */
export type SetDraft = { reps: string; weight: string; duration: string; warmup: boolean };
export type ExerciseDraft = { key: string; exerciseId: string; name: string; notes: string; sets: SetDraft[] };
export type LogDraft = { title: string; date: string; durationMin: string; notes: string; exercises: ExerciseDraft[] };

export type SetPayload = { reps: number | null; weight_kg: number | null; duration_s: number | null; is_warmup: boolean };
export type LogPayload = {
  id?: string;
  client_id: string;
  coaching_id?: string;
  booking_id?: string;
  template_id?: string;
  title: string;
  performed_at: string;
  local_date: string;
  duration_min: number | null;
  notes: string;
  exercises: { exercise_id: string; notes: string; sets: SetPayload[] }[];
};

export const MAX_EXERCISES = 30;
export const MAX_SETS = 30;
export const TITLE_MAX_LENGTH = 200;
export const LOG_NOTES_MAX_LENGTH = 5000;

export const emptySet = (): SetDraft => ({ reps: "", weight: "", duration: "", warmup: false });

/** A new set starts as a copy of the previous one: the usual case is the same weight and reps again. */
export function nextSet(sets: SetDraft[]): SetDraft {
  const last = sets.at(-1);
  return last ? { ...last, warmup: false } : emptySet();
}

export type DraftError =
  | { kind: "date" }
  | { kind: "duration" }
  | { kind: "title" }
  | { kind: "empty" }
  | { kind: "set"; exercise: number; set: number };


/**
 * The payload for a draft, or what to fix. A set with nothing typed is dropped; one with only a weight is
 * an error (a set needs reps or time). An exercise left without sets stays: the trainer planned it.
 */
export function draftPayload(
  draft: LogDraft,
  unit: WeightUnit,
  context: { id?: string; clientId: string; coachingId?: string; bookingId?: string; templateId?: string; performedAt: string },
): { ok: true; payload: LogPayload } | { ok: false; errors: DraftError[] } {
  const errors: DraftError[] = [];
  // parseDay refuses 2026-02-31, which Date.parse quietly turns into 3 March.
  if (parseDay(draft.date) === null) errors.push({ kind: "date" });
  const durationMin = draft.durationMin.trim() ? Number(draft.durationMin.trim()) : null;
  if (durationMin !== null && (!Number.isInteger(durationMin) || durationMin < 1 || durationMin > 600)) errors.push({ kind: "duration" });
  if (draft.title.trim().length > TITLE_MAX_LENGTH) errors.push({ kind: "title" });
  if (draft.exercises.length === 0) errors.push({ kind: "empty" });

  const exercises = draft.exercises.slice(0, MAX_EXERCISES).map((exercise, e) => ({
    exercise_id: exercise.exerciseId,
    notes: exercise.notes.trim(),
    sets: exercise.sets.slice(0, MAX_SETS).flatMap((set, s): SetPayload[] => {
      const blank = !set.reps.trim() && !set.weight.trim() && !set.duration.trim();
      if (blank) return [];
      const reps = set.reps.trim() ? parseAmount(set.reps) : null;
      const weight = set.weight.trim() ? parseAmount(set.weight) : null;
      const duration = set.duration.trim() ? parseDuration(set.duration) : null;
      const unreadable =
        (set.reps.trim() && (reps === null || !Number.isInteger(reps) || reps > 1000)) ||
        (set.weight.trim() && (weight === null || toKg(weight, unit) > 1000)) ||
        (set.duration.trim() && (duration === null || duration > 86400)) ||
        (reps === null && duration === null);
      if (unreadable) {
        errors.push({ kind: "set", exercise: e, set: s });
        return [];
      }
      return [{ reps, weight_kg: weight === null ? null : toKg(weight, unit), duration_s: duration, is_warmup: set.warmup }];
    }),
  }));

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    payload: {
      ...(context.id ? { id: context.id } : {}),
      client_id: context.clientId,
      ...(context.coachingId ? { coaching_id: context.coachingId } : {}),
      ...(context.bookingId ? { booking_id: context.bookingId } : {}),
      ...(context.templateId ? { template_id: context.templateId } : {}),
      title: draft.title.trim(),
      performed_at: context.performedAt,
      local_date: draft.date,
      duration_min: durationMin,
      notes: draft.notes.trim(),
      exercises,
    },
  };
}

/** When a log dated `day` (the viewer's zone) happened: now for today, else noon of that day in the zone. */
export function performedAtFor(day: string, timeZone: string, now: Date = new Date()): string {
  return paidAtFor(day, timeZone, now);
}

type SavedLog = {
  title: string | null;
  localDate: string;
  durationMin: number | null;
  notes: string | null;
  exercises: {
    exerciseId: string;
    name: string;
    notes: string | null;
    sets: { reps: number | null; weightKg: number | null; durationS: number | null; warmup: boolean }[];
  }[];
};

/** A saved log as the editor holds it, weights in the viewer's unit with their decimal mark. */
export function draftFromLog(log: SavedLog, unit: WeightUnit, decimalMark: "." | ","): LogDraft {
  const number = (value: number) => String(value).replace(".", decimalMark);
  return {
    title: log.title ?? "",
    date: log.localDate,
    durationMin: log.durationMin === null ? "" : String(log.durationMin),
    notes: log.notes ?? "",
    exercises: log.exercises.map((exercise, index) => ({
      key: `saved-${index}`,
      exerciseId: exercise.exerciseId,
      name: exercise.name,
      notes: exercise.notes ?? "",
      sets: exercise.sets.map((set) => ({
        reps: set.reps === null ? "" : String(set.reps),
        weight: set.weightKg === null ? "" : number(fromKg(set.weightKg, unit)),
        duration: set.durationS === null ? "" : formatDuration(set.durationS),
        warmup: set.warmup,
      })),
    })),
  };
}
