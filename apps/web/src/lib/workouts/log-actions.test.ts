import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const next = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/cache", () => ({ refresh: next.refresh }));

type Answer = { data?: unknown; error?: { message: string; code: string } | null };

/** Every query and RPC made as the signed-in user, and what they answer: keyed by table or "rpc:<name>". */
const db = vi.hoisted(() => ({
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
    for (const step of ["select", "delete", "eq"]) {
      chain[step] = (...args: unknown[]) => {
        steps.push(step, ...args);
        return chain;
      };
    }
    return chain;
  };
  return {
    createSupabaseServerClient: async () => ({
      from: (table: string) => query(table, [table]),
      rpc: (fn: string, args: unknown) => query(`rpc:${fn}`, ["rpc", fn, args]),
    }),
  };
});

const { deleteWorkoutLog, findExercises, lastResults, saveWorkoutLog } = await import("./log-actions");

const CLIENT = "00000000-0000-4000-8000-000000000001";
const LOG = "00000000-0000-4000-8000-000000000002";
const SQUAT = "00000000-0000-4000-8000-000000000003";
const ROW = "00000000-0000-4000-8000-000000000004";
const UNKNOWN = { message: "something internal broke", code: "XX000" };

const payload = {
  client_id: CLIENT,
  title: "Ноги",
  performed_at: "2026-10-18T09:00:00.000Z",
  local_date: "2026-10-18",
  duration_min: 60,
  notes: "",
  exercises: [{ exercise_id: SQUAT, notes: "", sets: [] }],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  Object.assign(db, { calls: [], answers: {} });
});

describe("saveWorkoutLog", () => {
  it("saves the whole log in one RPC and returns its id", async () => {
    db.answers["rpc:save_workout_log"] = { data: LOG };
    expect(await saveWorkoutLog(payload)).toEqual({ ok: true, id: LOG });
    expect(db.calls).toEqual([["rpc", "save_workout_log", { p_log: payload }]]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("refuses malformed client, log or exercise ids without a call", async () => {
    expect(await saveWorkoutLog({ ...payload, client_id: "client-1" })).toEqual({ ok: false, reason: "failed" });
    expect(await saveWorkoutLog({ ...payload, id: "log-1" })).toEqual({ ok: false, reason: "failed" });
    expect(await saveWorkoutLog({ ...payload, exercises: [...payload.exercises, { exercise_id: "squat", notes: "", sets: [] }] })).toEqual({
      ok: false,
      reason: "failed",
    });
    expect(db.calls).toEqual([]);
  });

  it("reads a refusal or a gone log as forbidden and anything else as failed", async () => {
    db.answers["rpc:save_workout_log"] = [
      { error: { message: "not allowed", code: "42501" } },
      { error: { message: "log_not_found", code: "P0002" } },
      { error: UNKNOWN },
    ];
    expect(await saveWorkoutLog(payload)).toEqual({ ok: false, reason: "forbidden" });
    expect(await saveWorkoutLog({ ...payload, id: LOG })).toEqual({ ok: false, reason: "forbidden" });
    expect(await saveWorkoutLog(payload)).toEqual({ ok: false, reason: "failed" });
    expect(next.refresh).not.toHaveBeenCalled();
  });
});

describe("deleteWorkoutLog", () => {
  it("deletes the log", async () => {
    db.answers.workout_logs = { data: [{ id: LOG }] };
    expect(await deleteWorkoutLog(LOG)).toEqual({ ok: true });
    expect(db.calls).toEqual([["workout_logs", "delete", "eq", "id", LOG, "select", "id"]]);
  });

  it("refuses a malformed id, and reads no row or an error as not deleted", async () => {
    expect(await deleteWorkoutLog("log-1")).toEqual({ ok: false });
    expect(db.calls).toEqual([]);
    db.answers.workout_logs = [{ data: [] }, { error: UNKNOWN }];
    expect(await deleteWorkoutLog(LOG)).toEqual({ ok: false });
    expect(await deleteWorkoutLog(LOG)).toEqual({ ok: false });
  });
});

describe("findExercises", () => {
  it("searches the library in the user's language and category", async () => {
    db.answers["rpc:search_exercises"] = { data: [{ id: SQUAT, name: "Присед", category: "legs", own: false, extra: "x" }] };
    expect(await findExercises({ query: "прис", locale: "ru", category: "legs" })).toEqual([{ id: SQUAT, name: "Присед", category: "legs", own: false }]);
    expect(db.calls).toEqual([["rpc", "search_exercises", { p_query: "прис", p_locale: "ru", p_category: "legs", p_limit: 30 }]]);
  });

  it("cuts the query at 100 characters and drops an unknown category", async () => {
    await findExercises({ query: "x".repeat(150), locale: "en", category: "neck" });
    expect(db.calls[0]?.[2]).toEqual({ p_query: "x".repeat(100), p_locale: "en", p_category: undefined, p_limit: 30 });
  });

  it("answers nothing for an unknown locale without a call, or on an error", async () => {
    expect(await findExercises({ query: "a", locale: "de" as never })).toEqual([]);
    expect(db.calls).toEqual([]);
    db.answers["rpc:search_exercises"] = { error: UNKNOWN };
    expect(await findExercises({ query: "a", locale: "ru" })).toEqual([]);
  });
});

describe("lastResults", () => {
  it("returns the working sets of the latest log before a date, warm-ups left out", async () => {
    db.answers["rpc:last_exercise_results"] = {
      data: [
        {
          exercise_id: SQUAT,
          performed_at: "2026-10-10T09:00:00Z",
          sets: [
            { reps: 10, weight_kg: 40, duration_s: null, is_warmup: true },
            { reps: 5, weight_kg: 100, duration_s: null, is_warmup: false },
          ],
        },
        { exercise_id: ROW, performed_at: "2026-10-09T09:00:00Z", sets: null },
      ],
    };
    expect(await lastResults({ clientId: CLIENT, exerciseIds: [SQUAT, ROW], before: "2026-10-18T00:00:00Z" })).toEqual([
      { exerciseId: SQUAT, performedAt: "2026-10-10T09:00:00Z", sets: [{ reps: 5, weightKg: 100, durationS: null }] },
      { exerciseId: ROW, performedAt: "2026-10-09T09:00:00Z", sets: [] },
    ]);
    expect(db.calls).toEqual([["rpc", "last_exercise_results", { p_client: CLIENT, p_exercises: [SQUAT, ROW], p_before: "2026-10-18T00:00:00Z" }]]);
  });

  it("asks for at most 30 exercises", async () => {
    await lastResults({ clientId: CLIENT, exerciseIds: Array.from({ length: 31 }, () => SQUAT) });
    expect((db.calls[0]?.[2] as { p_exercises: string[] }).p_exercises).toHaveLength(30);
  });

  it("answers nothing for no exercises or malformed ids without a call, or on an error", async () => {
    expect(await lastResults({ clientId: CLIENT, exerciseIds: [] })).toEqual([]);
    expect(await lastResults({ clientId: "client-1", exerciseIds: [SQUAT] })).toEqual([]);
    expect(await lastResults({ clientId: CLIENT, exerciseIds: [SQUAT, "row"] })).toEqual([]);
    expect(db.calls).toEqual([]);
    db.answers["rpc:last_exercise_results"] = { error: UNKNOWN };
    expect(await lastResults({ clientId: CLIENT, exerciseIds: [SQUAT] })).toEqual([]);
  });
});
