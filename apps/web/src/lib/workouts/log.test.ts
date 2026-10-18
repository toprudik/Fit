import { describe, expect, it } from "vitest";
import { draftFromLog, draftPayload, emptySet, nextSet, performedAtFor, type LogDraft } from "./log";

const context = { clientId: "c1", coachingId: "p1", performedAt: "2026-10-20T08:00:00.000Z" };
const draft = (exercises: LogDraft["exercises"], extra: Partial<LogDraft> = {}): LogDraft => ({
  title: " Верх ",
  date: "2026-10-20",
  durationMin: "60",
  notes: "",
  exercises,
  ...extra,
});
const bench = (sets: LogDraft["exercises"][number]["sets"]) => ({ key: "k", exerciseId: "bench", name: "Жим", notes: "", sets });

describe("draftPayload", () => {
  it("builds the save_workout_log payload, kilograms as stored", () => {
    const result = draftPayload(
      draft([
        bench([
          { reps: "10", weight: "40", duration: "", warmup: true },
          { reps: "5", weight: "100,5", duration: "", warmup: false },
        ]),
      ]),
      "kg",
      context,
    );
    expect(result).toEqual({
      ok: true,
      payload: {
        client_id: "c1",
        coaching_id: "p1",
        title: "Верх",
        performed_at: context.performedAt,
        local_date: "2026-10-20",
        duration_min: 60,
        notes: "",
        exercises: [
          {
            exercise_id: "bench",
            notes: "",
            sets: [
              { reps: 10, weight_kg: 40, duration_s: null, is_warmup: true },
              { reps: 5, weight_kg: 100.5, duration_s: null, is_warmup: false },
            ],
          },
        ],
      },
    });
  });

  it("stores pounds as kilograms (WORK-6) and time as seconds", () => {
    const result = draftPayload(draft([bench([{ reps: "5", weight: "225", duration: "1:30", warmup: false }])]), "lb", context);
    expect(result.ok && result.payload.exercises[0].sets[0]).toEqual({ reps: 5, weight_kg: 102.06, duration_s: 90, is_warmup: false });
  });

  it("drops blank sets and keeps an exercise without sets", () => {
    const result = draftPayload(draft([bench([emptySet()])]), "kg", context);
    expect(result.ok && result.payload.exercises[0].sets).toEqual([]);
  });

  it("names what to fix", () => {
    const result = draftPayload(
      draft(
        [
          bench([
            { reps: "", weight: "80", duration: "", warmup: false },
            { reps: "5.5", weight: "", duration: "", warmup: false },
          ]),
        ],
        {
          date: "20.10.2026",
          durationMin: "0",
        },
      ),
      "kg",
      context,
    );
    expect(result).toEqual({
      ok: false,
      errors: [{ kind: "date" }, { kind: "duration" }, { kind: "set", exercise: 0, set: 0 }, { kind: "set", exercise: 0, set: 1 }],
    });
    expect(draftPayload(draft([]), "kg", context)).toEqual({ ok: false, errors: [{ kind: "empty" }] });
    expect(draftPayload({ ...draft([]), date: "2026-02-31" }, "kg", context)).toEqual({
      ok: false,
      errors: [{ kind: "date" }, { kind: "empty" }],
    });
  });
});

describe("helpers", () => {
  it("starts a new set as a copy of the last working one", () => {
    expect(nextSet([{ reps: "5", weight: "100", duration: "", warmup: true }])).toEqual({
      reps: "5",
      weight: "100",
      duration: "",
      warmup: false,
    });
    expect(nextSet([])).toEqual(emptySet());
  });

  it("dates today now and another day at noon in the zone", () => {
    const now = new Date("2026-10-20T15:30:00Z");
    expect(performedAtFor("2026-10-20", "Europe/Moscow", now)).toBe(now.toISOString());
    expect(performedAtFor("2026-10-18", "Europe/Moscow", now)).toBe("2026-10-18T09:00:00.000Z");
  });
});

describe("draftFromLog", () => {
  it("reads a saved log back as typed, and saves it unchanged", () => {
    const saved = {
      title: null,
      localDate: "2026-10-20",
      durationMin: null,
      notes: null,
      exercises: [{ exerciseId: "bench", name: "Жим", notes: null, sets: [{ reps: 5, weightKg: 100.5, durationS: 90, warmup: false }] }],
    };
    const restored = draftFromLog(saved, "kg", ",");
    expect(restored.exercises[0].sets[0]).toEqual({ reps: "5", weight: "100,5", duration: "1:30", warmup: false });
    const result = draftPayload(restored, "kg", context);
    expect(result.ok && result.payload.exercises[0].sets[0]).toEqual({ reps: 5, weight_kg: 100.5, duration_s: 90, is_warmup: false });
  });
});
