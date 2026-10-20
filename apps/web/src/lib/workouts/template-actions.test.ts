import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const next = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/cache", () => ({ refresh: next.refresh }));

/** The trainer's templates as the loaders read them. */
const loaders = vi.hoisted(() => ({ loadTemplates: vi.fn(), loadTemplate: vi.fn() }));
vi.mock("./templates", () => loaders);

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
    for (const step of ["select", "update", "eq"]) {
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

const { pickableTemplates, saveWorkoutTemplate, setTemplateArchived, templateForLog } = await import("./template-actions");

const TEMPLATE = "00000000-0000-4000-8000-000000000001";
const SQUAT = "00000000-0000-4000-8000-000000000002";
const NOW = "2026-10-18T09:00:00.000Z";
const UNKNOWN = { message: "something internal broke", code: "XX000" };

const item = { exercise_id: SQUAT, target_sets: 3, target_reps: 8, target_weight_kg: 60, target_duration_s: null, rest_s: 90 };
const payload = { title: "Ноги", notes: "", items: [item] };

beforeAll(() => {
  vi.useFakeTimers({ now: new Date(NOW), toFake: ["Date"] });
});
afterAll(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  Object.assign(db, { calls: [], answers: {} });
});

describe("saveWorkoutTemplate", () => {
  it("saves the whole template in one RPC and returns its id", async () => {
    db.answers["rpc:save_workout_template"] = { data: TEMPLATE };
    expect(await saveWorkoutTemplate(payload)).toEqual({ ok: true, id: TEMPLATE });
    expect(db.calls).toEqual([["rpc", "save_workout_template", { p_template: payload }]]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("refuses a malformed template or exercise id without a call", async () => {
    expect(await saveWorkoutTemplate({ ...payload, id: "template-1" })).toEqual({ ok: false });
    expect(await saveWorkoutTemplate({ ...payload, items: [{ ...item, exercise_id: "squat" }] })).toEqual({ ok: false });
    expect(db.calls).toEqual([]);
  });

  it("reports an error, someone else's template included", async () => {
    db.answers["rpc:save_workout_template"] = { error: { message: "template_not_found", code: "P0002" } };
    expect(await saveWorkoutTemplate({ ...payload, id: TEMPLATE })).toEqual({ ok: false });
    expect(next.refresh).not.toHaveBeenCalled();
  });
});

describe("setTemplateArchived", () => {
  it("archives a template now and brings it back", async () => {
    db.answers.workout_templates = [{ data: [{ id: TEMPLATE }] }, { data: [{ id: TEMPLATE }] }];
    expect(await setTemplateArchived({ id: TEMPLATE, archived: true })).toEqual({ ok: true });
    expect(await setTemplateArchived({ id: TEMPLATE, archived: false })).toEqual({ ok: true });
    expect(db.calls).toEqual([
      ["workout_templates", "update", { archived_at: NOW }, "eq", "id", TEMPLATE, "select", "id"],
      ["workout_templates", "update", { archived_at: null }, "eq", "id", TEMPLATE, "select", "id"],
    ]);
  });

  it("refuses a malformed id, and reads no row or an error as not done", async () => {
    expect(await setTemplateArchived({ id: "t", archived: true })).toEqual({ ok: false });
    expect(db.calls).toEqual([]);
    db.answers.workout_templates = [{ data: [] }, { error: UNKNOWN }];
    expect(await setTemplateArchived({ id: TEMPLATE, archived: true })).toEqual({ ok: false });
    expect(await setTemplateArchived({ id: TEMPLATE, archived: true })).toEqual({ ok: false });
  });
});

describe("pickableTemplates", () => {
  it("lists live templates that have exercises, with only what the picker shows", async () => {
    loaders.loadTemplates.mockResolvedValue([
      { id: "t-1", title: "Ноги", exercises: 4, archived: false, notes: "x" },
      { id: "t-2", title: "Старый", exercises: 3, archived: true },
      { id: "t-3", title: "Пустой", exercises: 0, archived: false },
    ]);
    expect(await pickableTemplates()).toEqual([{ id: "t-1", title: "Ноги", exercises: 4 }]);
  });

  it("lists nothing when the templates are not readable", async () => {
    loaders.loadTemplates.mockResolvedValue(null);
    expect(await pickableTemplates()).toEqual([]);
  });
});

describe("templateForLog", () => {
  it("returns the title and items of the template in the user's language", async () => {
    const items = [{ exerciseId: SQUAT, name: "Присед", targetSets: 3, targetReps: 8, targetWeightKg: 60, targetDurationS: null, restS: 90 }];
    loaders.loadTemplate.mockResolvedValue({ id: TEMPLATE, title: "Ноги", notes: "", items });
    expect(await templateForLog({ id: TEMPLATE, locale: "en" })).toEqual({ title: "Ноги", items });
    expect(loaders.loadTemplate).toHaveBeenCalledWith(TEMPLATE, "en");
  });

  it("answers null for an unknown locale without loading, and for a template it cannot read", async () => {
    expect(await templateForLog({ id: TEMPLATE, locale: "de" as never })).toBeNull();
    expect(loaders.loadTemplate).not.toHaveBeenCalled();
    loaders.loadTemplate.mockResolvedValue(null);
    expect(await templateForLog({ id: TEMPLATE, locale: "ru" })).toBeNull();
  });
});
