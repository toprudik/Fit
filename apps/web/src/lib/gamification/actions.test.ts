import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const next = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/cache", () => ({ refresh: next.refresh }));

type Answer = { data: unknown; error: { message: string; code: string } | null };

/** RPC calls made as the signed-in user, and what the next one answers. */
const db = vi.hoisted(() => ({ calls: [] as unknown[][], answer: { data: null, error: null } as Answer }));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    rpc: (fn: string, args?: unknown) => {
      db.calls.push(args === undefined ? [fn] : [fn, args]);
      return Promise.resolve(db.answer);
    },
  }),
}));

const { markBadgesSeen, setWorkoutWeekGoal } = await import("./actions");

const CLIENT = "00000000-0000-4000-8000-000000000001";

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  db.calls = [];
  db.answer = { data: null, error: null };
});

describe("setWorkoutWeekGoal", () => {
  it.each([1, 3, 14])("sets %i workouts a week through set_workout_week_goal and refreshes", async (perWeek) => {
    expect(await setWorkoutWeekGoal({ clientId: CLIENT, perWeek })).toEqual({ ok: true });
    expect(db.calls).toEqual([["set_workout_week_goal", { p_client: CLIENT, p_per_week: perWeek }]]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it.each([
    ["zero a week", { clientId: CLIENT, perWeek: 0 }],
    ["15 a week", { clientId: CLIENT, perWeek: 15 }],
    ["a fraction", { clientId: CLIENT, perWeek: 2.5 }],
    ["NaN", { clientId: CLIENT, perWeek: Number.NaN }],
    ["a number as text", { clientId: CLIENT, perWeek: "3" as unknown as number }],
    ["a malformed client id", { clientId: "client-1", perWeek: 3 }],
  ])("refuses %s without a call", async (_label, input) => {
    expect(await setWorkoutWeekGoal(input)).toEqual({ ok: false });
    expect(db.calls).toEqual([]);
  });

  it("fails without refreshing when the database refuses (not this client's trainer)", async () => {
    db.answer = { data: null, error: { code: "42501", message: "not_allowed" } };
    expect(await setWorkoutWeekGoal({ clientId: CLIENT, perWeek: 3 })).toEqual({ ok: false });
    expect(next.refresh).not.toHaveBeenCalled();
  });
});

describe("markBadgesSeen", () => {
  it("calls mark_badges_seen without arguments", async () => {
    await markBadgesSeen();
    expect(db.calls).toEqual([["mark_badges_seen"]]);
  });

  it("swallows an error and only logs its code", async () => {
    db.answer = { data: null, error: { code: "42501", message: "secret detail" } };
    await expect(markBadgesSeen()).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledWith("marking badges seen failed", "42501");
  });
});
