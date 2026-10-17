/**
 * Homework (PRD wave-2 §10): pure rules shared by the trainer's and the client's screens. Dates are the
 * client's days as "YYYY-MM-DD"; "overdue" is derived, never stored (an occurrence past its day without a mark).
 */

import { emptySet, MAX_EXERCISES, TITLE_MAX_LENGTH, type LogDraft } from "@/lib/workouts/log";

export const HOMEWORK_TITLE_MAX_LENGTH = 200;
export const HOMEWORK_DESCRIPTION_MAX_LENGTH = 2000;
export const HOMEWORK_COMMENT_MAX_LENGTH = 1000;
/** A repeat lasts up to half a year (homework_repeat_until_check). */
export const HOMEWORK_REPEAT_MAX_DAYS = 183;
/** "Выполнено" can be taken back this long (PRD 10-4). */
export const UNMARK_WINDOW_MS = 24 * 60 * 60 * 1000;
/** The trainer sees the share of done deadlines over this many days (PRD 10-6). */
export const COMPLETION_DAYS = 30;
/** ISO weekdays, Monday first. */
export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

/** At most this many exercises in a homework (homework_exercises_position_check). */
export const HOMEWORK_MAX_EXERCISES = 30;
export const HOMEWORK_PRESCRIPTION_MAX_LENGTH = 200;

export type HomeworkOccurrence = {
  id: string;
  dueOn: string;
  doneAt: string | null;
  comment: string | null;
  /** The client's own log of the sets done for this deadline (PRD 10.2). */
  workoutLogId: string | null;
};

/** An exercise of the homework with the trainer's prescription ("3 × 12"). */
export type HomeworkExercise = { exerciseId: string; name: string; prescription: string | null };

export type Homework = {
  id: string;
  coachingId: string;
  title: string;
  description: string | null;
  videoUrl: string | null;
  dueDate: string;
  repeatWeekdays: number[] | null;
  repeatUntil: string | null;
  archived: boolean;
  /** In the trainer's order. */
  exercises: HomeworkExercise[];
  /** Oldest first. */
  occurrences: HomeworkOccurrence[];
};

export type OccurrenceState = "done" | "overdue" | "open";

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isHomeworkId(value: unknown): value is string {
  return typeof value === "string" && ID.test(value);
}

/** "2026-10-17" plus n days. */
export function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function occurrenceState(occurrence: HomeworkOccurrence, today: string): OccurrenceState {
  if (occurrence.doneAt) return "done";
  return occurrence.dueOn < today ? "overdue" : "open";
}

/**
 * The deadline a list shows for a homework: the earliest one without a mark (overdue ones first, then the
 * next one ahead), else the latest done one. Null for a homework without deadlines.
 */
export function currentOccurrence(homework: Homework): HomeworkOccurrence | null {
  return homework.occurrences.find((o) => !o.doneAt) ?? homework.occurrences.at(-1) ?? null;
}

/** mark_homework_done takes a deadline that has come, or the earliest open one (done ahead of its day). */
export function canMark(homework: Homework, occurrence: HomeworkOccurrence, today: string): boolean {
  if (homework.archived || occurrence.doneAt) return false;
  return occurrence.dueOn <= today || homework.occurrences.find((o) => !o.doneAt)?.id === occurrence.id;
}

export function canUnmark(occurrence: HomeworkOccurrence, now: Date): boolean {
  return occurrence.doneAt !== null && now.getTime() - new Date(occurrence.doneAt).getTime() < UNMARK_WINDOW_MS;
}

/**
 * Done deadlines out of those due in the last 30 days, today included, over every homework of the pair
 * (PRD 10-6, 10.4); a deadline ahead that is already done counts too. Null when nothing was due.
 */
export function completionRate(
  homework: Homework[],
  today: string,
  days = COMPLETION_DAYS,
): { done: number; total: number; percent: number } | null {
  const from = addDays(today, -(days - 1));
  const counted = homework.flatMap((h) => h.occurrences).filter((o) => o.dueOn >= from && (o.dueOn <= today || o.doneAt));
  if (!counted.length) return null;
  const done = counted.filter((o) => o.doneAt).length;
  return { done, total: counted.length, percent: Math.round((done / counted.length) * 100) };
}

/** The form of "Задать домашку" as typed. */
export type HomeworkDraft = {
  title: string;
  description: string;
  videoUrl: string;
  dueDate: string;
  repeat: boolean;
  weekdays: number[];
  repeatUntil: string;
  exercises: HomeworkExerciseDraft[];
};

export type HomeworkExerciseDraft = { key: string; exerciseId: string; name: string; prescription: string };

export type HomeworkPayload = {
  id?: string;
  coaching_id?: string;
  title: string;
  description: string | null;
  video_url: string | null;
  due_date: string;
  repeat_weekdays: number[] | null;
  repeat_until: string | null;
  exercises: { exercise_id: string; prescription: string | null }[];
};

export type HomeworkDraftError = "title" | "videoUrl" | "dueDate" | "weekdays" | "repeatUntil";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function isDay(value: string): boolean {
  return DAY.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && addDays(value, 0) === value;
}

/** Checks the form against the rules of save_homework, so the database only refuses what changed meanwhile. */
export function homeworkPayload(
  draft: HomeworkDraft,
  today: string,
  target: { id: string; dueDate: string } | { coachingId: string },
): { ok: true; payload: HomeworkPayload } | { ok: false; errors: HomeworkDraftError[] } {
  const errors: HomeworkDraftError[] = [];
  const title = draft.title.trim();
  const videoUrl = draft.videoUrl.trim();
  if (!title || title.length > HOMEWORK_TITLE_MAX_LENGTH) errors.push("title");
  if (videoUrl && (!/^https:\/\/\S+$/.test(videoUrl) || videoUrl.length > 500)) errors.push("videoUrl");
  const keptDue = "id" in target && draft.dueDate === target.dueDate;
  if (!isDay(draft.dueDate) || (draft.dueDate < today && !keptDue)) errors.push("dueDate");
  const weekdays = draft.repeat ? [...new Set(draft.weekdays)].filter((d) => WEEKDAYS.includes(d as never)).sort((a, b) => a - b) : [];
  if (draft.repeat) {
    if (!weekdays.length) errors.push("weekdays");
    if (
      !isDay(draft.repeatUntil) ||
      (isDay(draft.dueDate) &&
        (draft.repeatUntil < draft.dueDate || draft.repeatUntil > addDays(draft.dueDate, HOMEWORK_REPEAT_MAX_DAYS))) ||
      draft.repeatUntil < today
    ) {
      errors.push("repeatUntil");
    }
  }
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    payload: {
      ...("id" in target ? { id: target.id } : { coaching_id: target.coachingId }),
      title,
      description: draft.description.trim() || null,
      video_url: videoUrl || null,
      due_date: draft.dueDate,
      repeat_weekdays: draft.repeat ? weekdays : null,
      repeat_until: draft.repeat ? draft.repeatUntil : null,
      exercises: draft.exercises.slice(0, HOMEWORK_MAX_EXERCISES).map((exercise) => ({
        exercise_id: exercise.exerciseId,
        prescription: exercise.prescription.trim().slice(0, HOMEWORK_PRESCRIPTION_MAX_LENGTH) || null,
      })),
    },
  };
}

/** The form filled from a saved homework, for "Изменить". */
export function draftFromHomework(homework: Homework): HomeworkDraft {
  return {
    title: homework.title,
    description: homework.description ?? "",
    videoUrl: homework.videoUrl ?? "",
    dueDate: homework.dueDate,
    repeat: homework.repeatWeekdays !== null,
    weekdays: homework.repeatWeekdays ?? [],
    repeatUntil: homework.repeatUntil ?? "",
    exercises: homework.exercises.map((exercise, index) => ({
      key: `saved-${index}`,
      exerciseId: exercise.exerciseId,
      name: exercise.name,
      prescription: exercise.prescription ?? "",
    })),
  };
}

/**
 * "Записать подходы" (PRD 10-3): a new self log for the deadline, titled as the homework and holding its
 * exercises, each with the prescription as its note and one empty set to fill.
 */
export function logDraftFromHomework(homework: Homework, day: string): LogDraft {
  return {
    title: homework.title.slice(0, TITLE_MAX_LENGTH),
    date: day,
    durationMin: "",
    notes: "",
    exercises: homework.exercises.slice(0, MAX_EXERCISES).map((exercise, index) => ({
      key: `homework-${index}-${exercise.exerciseId}`,
      exerciseId: exercise.exerciseId,
      name: exercise.name,
      notes: exercise.prescription ?? "",
      sets: [emptySet()],
    })),
  };
}
