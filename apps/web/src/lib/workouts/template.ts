import { emptySet, MAX_EXERCISES, type ExerciseDraft, type SetDraft } from "./log";
import { formatDuration, fromKg, parseAmount, parseDuration, toKg, type WeightUnit } from "./units";

/**
 * The template editor's model (PRD wave-1 §2.10-7, WORK-5): an exercise with its plan as typed, and the payload
 * of `save_workout_template`. Applying a template turns the plan into the sets of a new log.
 */
export type TemplateItemDraft = {
  key: string;
  exerciseId: string;
  name: string;
  sets: string;
  reps: string;
  weight: string;
  duration: string;
  rest: string;
};
export type TemplateDraft = { title: string; notes: string; items: TemplateItemDraft[] };

export type TemplateItemPayload = {
  exercise_id: string;
  target_sets: number | null;
  target_reps: number | null;
  target_weight_kg: number | null;
  target_duration_s: number | null;
  rest_s: number | null;
};
export type TemplatePayload = { id?: string; title: string; notes: string; items: TemplateItemPayload[] };

export type TemplateItem = {
  exerciseId: string;
  name: string;
  targetSets: number | null;
  targetReps: number | null;
  targetWeightKg: number | null;
  targetDurationS: number | null;
  restS: number | null;
};

export const TEMPLATE_TITLE_MAX_LENGTH = 200;
export const TEMPLATE_NOTES_MAX_LENGTH = 2000;

export type TemplateDraftError = { kind: "name" } | { kind: "empty" } | { kind: "targets"; item: number };

const whole = (text: string, max: number, min = 0): number | null | false => {
  if (!text.trim()) return null;
  const value = parseAmount(text);
  return value !== null && Number.isInteger(value) && value >= min && value <= max ? value : false;
};

/** The payload for a draft, or what to fix. Every target is optional; a plan without sets means one set. */
export function templatePayload(
  draft: TemplateDraft,
  unit: WeightUnit,
  id?: string,
): { ok: true; payload: TemplatePayload } | { ok: false; errors: TemplateDraftError[] } {
  const errors: TemplateDraftError[] = [];
  const title = draft.title.trim();
  if (!title || title.length > TEMPLATE_TITLE_MAX_LENGTH) errors.push({ kind: "name" });
  if (!draft.items.length) errors.push({ kind: "empty" });
  const items = draft.items.slice(0, MAX_EXERCISES).map((item, index): TemplateItemPayload => {
    const sets = whole(item.sets, 50, 1);
    const reps = whole(item.reps, 1000, 1);
    const rest = whole(item.rest, 3600);
    const weight = item.weight.trim() ? parseAmount(item.weight) : null;
    const duration = item.duration.trim() ? parseDuration(item.duration) : null;
    const bad =
      sets === false ||
      reps === false ||
      rest === false ||
      (item.weight.trim() && (weight === null || toKg(weight, unit) > 1000)) ||
      (item.duration.trim() && (duration === null || duration < 1 || duration > 86400));
    if (bad) errors.push({ kind: "targets", item: index });
    return {
      exercise_id: item.exerciseId,
      target_sets: sets || null,
      target_reps: reps || null,
      target_weight_kg: weight === null ? null : toKg(weight, unit),
      target_duration_s: duration,
      rest_s: rest === false ? null : rest,
    };
  });
  if (errors.length) return { ok: false, errors };
  return { ok: true, payload: { ...(id ? { id } : {}), title, notes: draft.notes.trim(), items } };
}

/** A saved template as the editor holds it, weights in the viewer's unit with their decimal mark. */
export function draftFromTemplate(
  template: { title: string; notes: string | null; items: TemplateItem[] },
  unit: WeightUnit,
  decimalMark: "." | ",",
): TemplateDraft {
  const text = (value: number | null) => (value === null ? "" : String(value));
  return {
    title: template.title,
    notes: template.notes ?? "",
    items: template.items.map((item, index) => ({
      key: `saved-${index}`,
      exerciseId: item.exerciseId,
      name: item.name,
      sets: text(item.targetSets),
      reps: text(item.targetReps),
      weight: item.targetWeightKg === null ? "" : String(fromKg(item.targetWeightKg, unit)).replace(".", decimalMark),
      duration: item.targetDurationS === null ? "" : formatDuration(item.targetDurationS),
      rest: text(item.restS),
    })),
  };
}

/** The exercises of a new log from a template (WORK-5): each planned set becomes a set to fill in. */
export function logExercisesFromTemplate(items: TemplateItem[], unit: WeightUnit, decimalMark: "." | ","): ExerciseDraft[] {
  return items.slice(0, MAX_EXERCISES).map((item, index) => {
    const set: SetDraft = {
      ...emptySet(),
      reps: item.targetReps === null ? "" : String(item.targetReps),
      weight: item.targetWeightKg === null ? "" : String(fromKg(item.targetWeightKg, unit)).replace(".", decimalMark),
      duration: item.targetDurationS === null ? "" : formatDuration(item.targetDurationS),
    };
    return {
      key: `template-${index}-${item.exerciseId}`,
      exerciseId: item.exerciseId,
      name: item.name,
      notes: "",
      sets: Array.from({ length: Math.max(1, item.targetSets ?? 1) }, () => ({ ...set })),
    };
  });
}
