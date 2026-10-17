import { describe, expect, it } from "vitest";
import { draftFromTemplate, logExercisesFromTemplate, templatePayload, type TemplateDraft, type TemplateItem } from "./template";

const item = (extra: Partial<TemplateDraft["items"][number]> = {}) => ({
  key: "k",
  exerciseId: "bench",
  name: "Жим",
  sets: "3",
  reps: "8",
  weight: "60,5",
  duration: "",
  rest: "90",
  ...extra,
});

describe("templatePayload", () => {
  it("builds the save_workout_template payload, kilograms as stored", () => {
    expect(templatePayload({ title: " Верх ", notes: "", items: [item()] }, "kg")).toEqual({
      ok: true,
      payload: {
        title: "Верх",
        notes: "",
        items: [{ exercise_id: "bench", target_sets: 3, target_reps: 8, target_weight_kg: 60.5, target_duration_s: null, rest_s: 90 }],
      },
    });
  });

  it("keeps empty targets empty and stores pounds as kilograms", () => {
    const result = templatePayload(
      { title: "Core", notes: "", items: [item({ sets: "", reps: "", weight: "225", duration: "1:30", rest: "" })] },
      "lb",
      "t1",
    );
    expect(result.ok && result.payload).toEqual({
      id: "t1",
      title: "Core",
      notes: "",
      items: [
        { exercise_id: "bench", target_sets: null, target_reps: null, target_weight_kg: 102.06, target_duration_s: 90, rest_s: null },
      ],
    });
  });

  it("names what to fix", () => {
    expect(templatePayload({ title: " ", notes: "", items: [] }, "kg")).toEqual({
      ok: false,
      errors: [{ kind: "name" }, { kind: "empty" }],
    });
    expect(templatePayload({ title: "A", notes: "", items: [item(), item({ sets: "0" }), item({ reps: "2.5" })] }, "kg")).toEqual({
      ok: false,
      errors: [
        { kind: "targets", item: 1 },
        { kind: "targets", item: 2 },
      ],
    });
  });
});

const saved: TemplateItem[] = [
  { exerciseId: "bench", name: "Жим", targetSets: 3, targetReps: 8, targetWeightKg: 60.5, targetDurationS: null, restS: 90 },
  { exerciseId: "plank", name: "Планка", targetSets: null, targetReps: null, targetWeightKg: null, targetDurationS: 45, restS: null },
];

describe("applying and editing a template", () => {
  it("turns each planned set into a set of the log (WORK-5)", () => {
    const exercises = logExercisesFromTemplate(saved, "kg", ",");
    expect(exercises.map((e) => e.sets.length)).toEqual([3, 1]);
    expect(exercises[0].sets[0]).toEqual({ reps: "8", weight: "60,5", duration: "", warmup: false });
    expect(exercises[1].sets[0]).toEqual({ reps: "", weight: "", duration: "0:45", warmup: false });
  });

  it("reads a saved template back as typed, and saves it unchanged", () => {
    const draft = draftFromTemplate({ title: "Верх", notes: null, items: saved }, "kg", ",");
    const result = templatePayload(draft, "kg");
    expect(result.ok && result.payload.items).toEqual([
      { exercise_id: "bench", target_sets: 3, target_reps: 8, target_weight_kg: 60.5, target_duration_s: null, rest_s: 90 },
      { exercise_id: "plank", target_sets: null, target_reps: null, target_weight_kg: null, target_duration_s: 45, rest_s: null },
    ]);
  });
});
