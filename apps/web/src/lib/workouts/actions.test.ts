import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const next = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/cache", () => ({ refresh: next.refresh }));

type Answer = { data?: unknown; error?: { message: string; code: string } | null };

/** Every query made as the signed-in user, step by step, and what each table answers (an array: one per call). */
const db = vi.hoisted(() => ({
  userId: "trainer-1" as string | null,
  calls: [] as unknown[][],
  answers: {} as Record<string, Answer | Answer[]>,
}));

vi.mock("@/lib/supabase/server", () => {
  const answer = (key: string): Answer => {
    const queued = db.answers[key];
    return { data: null, error: null, ...(Array.isArray(queued) ? queued.shift() : queued) };
  };
  const query = (key: string, steps: unknown[]) => {
    db.calls.push(steps);
    let result: Answer | undefined;
    const chain: Record<string, unknown> = {
      then: (resolve: (value: Answer) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve((result ??= answer(key))).then(resolve, reject),
    };
    for (const step of ["select", "insert", "update", "eq", "single", "maybeSingle"]) {
      chain[step] = (...args: unknown[]) => {
        steps.push(step, ...args);
        return chain;
      };
    }
    return chain;
  };
  return {
    createSupabaseServerClient: async () => ({
      auth: { getClaims: async () => ({ data: db.userId ? { claims: { sub: db.userId } } : null }) },
      from: (table: string) => query(table, [table]),
    }),
  };
});

const { saveExercise, setExerciseArchived } = await import("./actions");

const EXERCISE = "00000000-0000-4000-8000-000000000001";
const SOURCE = "00000000-0000-4000-8000-000000000002";
const NOW = "2026-10-18T09:00:00.000Z";
const UNKNOWN = { message: "something internal broke", code: "XX000" };

const input = {
  locale: "ru" as const,
  name: "  Тяга гантели  ",
  category: "back",
  muscles: ["lats", "biceps", "wings"],
  equipment: ["dumbbell", "spaceship"],
  description: "  Спина прямая  ",
  videoUrl: "",
};

const writes = () => db.calls.filter((call) => call.includes("insert") || call.includes("update"));

beforeAll(() => {
  vi.useFakeTimers({ now: new Date(NOW), toFake: ["Date"] });
});
afterAll(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  Object.assign(db, { userId: "trainer-1", calls: [], answers: {} });
});

describe("saveExercise", () => {
  it("creates an own exercise with known muscles and equipment only, then its translation", async () => {
    db.answers.exercises = { data: { id: EXERCISE } };
    db.answers.exercise_translations = [{ data: [] }, {}];
    expect(await saveExercise(input)).toEqual({ ok: true, id: EXERCISE });
    expect(writes()).toEqual([
      [
        "exercises",
        "insert",
        {
          source: "custom",
          owner_id: "trainer-1",
          name: "Тяга гантели",
          category: "back",
          muscles_primary: ["biceps", "lats"],
          equipment: ["dumbbell"],
          video_url: null,
          license: null,
          license_author: null,
          source_url: null,
          muscles_secondary: [],
        },
        "select",
        "id",
        "single",
      ],
      ["exercise_translations", "update", { name: "Тяга гантели", description: "Спина прямая" }, "eq", "exercise_id", EXERCISE, "eq", "locale", "ru", "select", "exercise_id"],
      ["exercise_translations", "insert", { exercise_id: EXERCISE, locale: "ru", name: "Тяга гантели", description: "Спина прямая" }],
    ]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("keeps the license and authors of the wger exercise it copies, without repeating primary muscles", async () => {
    db.answers.exercises = [
      { data: { license: "CC-BY-SA-4.0", license_author: "wger contributors", source_url: "https://wger.example.test/1", muscles_secondary: ["biceps", "rear_delts"] } },
      { data: { id: EXERCISE } },
    ];
    db.answers.exercise_translations = { data: [{ exercise_id: EXERCISE }] };
    await saveExercise({ ...input, basedOn: SOURCE });
    expect(db.calls[0]).toEqual(["exercises", "select", "license, license_author, source_url, muscles_secondary", "eq", "id", SOURCE, "maybeSingle"]);
    expect(writes()[0]?.[2]).toMatchObject({
      license: "CC-BY-SA-4.0",
      license_author: "wger contributors",
      source_url: "https://wger.example.test/1",
      muscles_secondary: ["rear_delts"],
    });
  });

  it("edits only the caller's own exercise and updates the translation in place", async () => {
    db.answers.exercises = { data: [{ id: EXERCISE }] };
    db.answers.exercise_translations = { data: [{ exercise_id: EXERCISE }] };
    expect(await saveExercise({ ...input, id: EXERCISE, locale: "en", description: "", videoUrl: " https://video.example.test/a " })).toEqual({
      ok: true,
      id: EXERCISE,
    });
    expect(writes()).toEqual([
      [
        "exercises",
        "update",
        { name: "Тяга гантели", category: "back", muscles_primary: ["biceps", "lats"], equipment: ["dumbbell"], video_url: "https://video.example.test/a" },
        "eq",
        "id",
        EXERCISE,
        "eq",
        "owner_id",
        "trainer-1",
        "select",
        "id",
      ],
      ["exercise_translations", "update", { name: "Тяга гантели", description: null }, "eq", "exercise_id", EXERCISE, "eq", "locale", "en", "select", "exercise_id"],
    ]);
  });

  it("names every bad field and calls nothing", async () => {
    expect(
      await saveExercise({ ...input, name: "  ", category: "neck", description: "x".repeat(5001), videoUrl: "http://video.example.test/a" }),
    ).toEqual({ ok: false, reason: "invalid", fields: ["name", "category", "description", "videoUrl"] });
    expect(await saveExercise({ ...input, name: "x".repeat(201) })).toEqual({ ok: false, reason: "invalid", fields: ["name"] });
    expect(await saveExercise({ ...input, videoUrl: "https://localhost/a" })).toEqual({ ok: false, reason: "invalid", fields: ["videoUrl"] });
    expect(await saveExercise({ ...input, videoUrl: `https://v.example.test/${"x".repeat(500)}` })).toEqual({ ok: false, reason: "invalid", fields: ["videoUrl"] });
    expect(db.calls).toEqual([]);
  });

  it("takes a name of 200 and a description of 5000 characters", async () => {
    db.answers.exercises = { data: { id: EXERCISE } };
    db.answers.exercise_translations = { data: [{ exercise_id: EXERCISE }] };
    expect(await saveExercise({ ...input, name: "x".repeat(200), description: "x".repeat(5000) })).toEqual({ ok: true, id: EXERCISE });
  });

  it("refuses an unknown locale or malformed ids without a call", async () => {
    expect(await saveExercise({ ...input, locale: "de" as never })).toEqual({ ok: false, reason: "failed" });
    expect(await saveExercise({ ...input, id: "exercise-1" })).toEqual({ ok: false, reason: "failed" });
    expect(await saveExercise({ ...input, basedOn: "wger-1" })).toEqual({ ok: false, reason: "failed" });
    expect(db.calls).toEqual([]);
  });

  it("needs a session", async () => {
    db.userId = null;
    expect(await saveExercise(input)).toEqual({ ok: false, reason: "failed" });
    expect(writes()).toEqual([]);
  });

  it("fails on someone else's exercise or any write error, without a refresh", async () => {
    db.answers.exercises = [{ data: [] }, { error: UNKNOWN }, { error: UNKNOWN }];
    expect(await saveExercise({ ...input, id: EXERCISE })).toEqual({ ok: false, reason: "failed" });
    expect(await saveExercise({ ...input, id: EXERCISE })).toEqual({ ok: false, reason: "failed" });
    expect(await saveExercise(input)).toEqual({ ok: false, reason: "failed" });
    expect(db.calls.some((call) => call[0] === "exercise_translations")).toBe(false);
    expect(next.refresh).not.toHaveBeenCalled();
  });

  it("fails when the translation cannot be updated or added", async () => {
    db.answers.exercises = [{ data: { id: EXERCISE } }, { data: { id: EXERCISE } }];
    db.answers.exercise_translations = [{ error: UNKNOWN }, { data: [] }, { error: UNKNOWN }];
    expect(await saveExercise(input)).toEqual({ ok: false, reason: "failed" });
    expect(await saveExercise(input)).toEqual({ ok: false, reason: "failed" });
    expect(next.refresh).not.toHaveBeenCalled();
  });
});

describe("setExerciseArchived", () => {
  it("archives an own exercise now and brings it back", async () => {
    db.answers.exercises = [{ data: [{ id: EXERCISE }] }, { data: [{ id: EXERCISE }] }];
    expect(await setExerciseArchived({ id: EXERCISE, archived: true })).toEqual({ ok: true });
    expect(await setExerciseArchived({ id: EXERCISE, archived: false })).toEqual({ ok: true });
    expect(db.calls).toEqual([
      ["exercises", "update", { archived_at: NOW }, "eq", "id", EXERCISE, "eq", "source", "custom", "select", "id"],
      ["exercises", "update", { archived_at: null }, "eq", "id", EXERCISE, "eq", "source", "custom", "select", "id"],
    ]);
    expect(next.refresh).toHaveBeenCalledTimes(2);
  });

  it("refuses a malformed id, and reads no row or an error as not done", async () => {
    expect(await setExerciseArchived({ id: "e", archived: true })).toEqual({ ok: false });
    expect(db.calls).toEqual([]);
    db.answers.exercises = [{ data: [] }, { error: UNKNOWN }];
    expect(await setExerciseArchived({ id: EXERCISE, archived: true })).toEqual({ ok: false });
    expect(await setExerciseArchived({ id: EXERCISE, archived: true })).toEqual({ ok: false });
    expect(next.refresh).not.toHaveBeenCalled();
  });
});
