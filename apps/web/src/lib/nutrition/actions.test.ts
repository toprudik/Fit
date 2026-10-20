import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const next = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/cache", () => ({ refresh: next.refresh }));

type Answer = { data: unknown; error: { message: string; code: string } | null };

/** Table and RPC calls made as the signed-in user, and what each one answers in turn. */
const db = vi.hoisted(() => ({
  calls: [] as unknown[][],
  answers: [] as Answer[],
  userId: "client-1" as string | null,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => {
    const answer = () => db.answers.shift() ?? { data: null, error: null };
    return {
      auth: { getClaims: async () => ({ data: db.userId ? { claims: { sub: db.userId } } : null }) },
      from: (table: string) => ({
        upsert: (values: unknown, options: unknown) => {
          db.calls.push([table, "upsert", values, options]);
          return Promise.resolve(answer());
        },
      }),
      rpc: (fn: string, args: unknown) => {
        db.calls.push(["rpc", fn, args]);
        return Promise.resolve(answer());
      },
    };
  },
}));

const { calculateNutrition, chooseNutritionTarget, clearPairTarget, saveCalculatorTarget, setNutritionGoal, setPairTarget } = await import(
  "./actions"
);

const PAIR = "00000000-0000-4000-8000-000000000001";
const denied = { data: null, error: { code: "42501", message: "not_allowed" } };
const badValue = { data: null, error: { code: "22023", message: "bad_weight" } };
const broken = { data: null, error: { code: "XX000", message: "internal detail" } };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  Object.assign(db, { calls: [], answers: [], userId: "client-1" });
});

describe("setNutritionGoal", () => {
  it.each(["lose", "maintain", "gain"] as const)("saves %s through set_client_goal and refreshes", async (goal) => {
    expect(await setNutritionGoal(goal)).toEqual({ ok: true });
    expect(db.calls).toEqual([["rpc", "set_client_goal", { p_goal: goal }]]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("refuses an unknown goal without a call", async () => {
    expect(await setNutritionGoal("bulk" as "gain")).toEqual({ ok: false, reason: "invalid" });
    expect(db.calls).toEqual([]);
  });

  it("maps a refusal to invalid and anything else to failed", async () => {
    db.answers = [denied, broken];
    expect(await setNutritionGoal("lose")).toEqual({ ok: false, reason: "invalid" });
    expect(await setNutritionGoal("lose")).toEqual({ ok: false, reason: "failed" });
    expect(next.refresh).not.toHaveBeenCalled();
  });
});

describe("calculateNutrition", () => {
  const input = { goal: "lose", sex: "female", birthDate: "1990-05-17", heightCm: 168.44, activity: "moderate", weightKg: 64.5 } as const;
  const result = { status: "ok", kcal: 1850, protein_g: 120, fat_g: 60, carbs_g: 205, bmr: 1400, age: 36 };

  it("saves the body profile, then the goal, then runs the calculator", async () => {
    db.answers = [{ data: null, error: null }, { data: null, error: null }, { data: result, error: null }];
    expect(await calculateNutrition(input)).toEqual({
      ok: true,
      result: { status: "ok", kcal: 1850, proteinG: 120, fatG: 60, carbsG: 205, bmr: 1400, age: 36 },
    });
    expect(db.calls).toEqual([
      [
        "body_profiles",
        "upsert",
        { user_id: "client-1", calc_sex: "female", birth_date: "1990-05-17", height_cm: 168.4, activity_level: "moderate" },
        { onConflict: "user_id" },
      ],
      ["rpc", "set_client_goal", { p_goal: "lose" }],
      ["rpc", "calculate_nutrition_target", { p_weight_kg: 64.5 }],
    ]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("passes on a result the calculator cannot give (a minor)", async () => {
    db.answers = [{ data: null, error: null }, { data: null, error: null }, { data: { status: "minor" }, error: null }];
    expect(await calculateNutrition(input)).toEqual({ ok: true, result: { status: "minor" } });
  });

  it("takes the edges of height, weight and birth date", async () => {
    expect(await calculateNutrition({ ...input, heightCm: 80, weightKg: 25, birthDate: "1900-01-02" })).toMatchObject({ ok: true });
    expect(await calculateNutrition({ ...input, heightCm: 260, weightKg: 350 })).toMatchObject({ ok: true });
  });

  it.each([
    ["an unknown goal", { goal: "bulk" }],
    ["an unknown sex", { sex: "other" }],
    ["an unknown activity", { activity: "extreme" }],
    ["a malformed birth date", { birthDate: "17.05.1990" }],
    ["an impossible birth date", { birthDate: "1990-02-30" }],
    ["a birth date before 1900-01-02", { birthDate: "1900-01-01" }],
    ["a height under 80", { heightCm: 79.9 }],
    ["a height over 260", { heightCm: 260.1 }],
    ["a weight under 25", { weightKg: 24.9 }],
    ["a weight over 350", { weightKg: 350.1 }],
    ["a weight that is not a number", { weightKg: Number.NaN }],
    ["a height as text", { heightCm: "170" }],
  ])("refuses %s without a query", async (_label, over) => {
    expect(await calculateNutrition({ ...input, ...over } as typeof input)).toEqual({ ok: false, reason: "invalid" });
    expect(db.calls).toEqual([]);
  });

  it("writes nothing when signed out", async () => {
    db.userId = null;
    expect(await calculateNutrition(input)).toEqual({ ok: false, reason: "invalid" });
    expect(db.calls).toEqual([]);
  });

  it("stops at the first failed step", async () => {
    db.answers = [broken];
    expect(await calculateNutrition(input)).toEqual({ ok: false, reason: "failed" });
    expect(db.calls).toHaveLength(1);
    db.calls = [];
    db.answers = [{ data: null, error: null }, broken];
    expect(await calculateNutrition(input)).toEqual({ ok: false, reason: "failed" });
    expect(db.calls).toHaveLength(2);
    expect(next.refresh).not.toHaveBeenCalled();
  });

  it("reads a value the calculator refuses as invalid and other calculator errors as failed", async () => {
    db.answers = [{ data: null, error: null }, { data: null, error: null }, badValue];
    expect(await calculateNutrition(input)).toEqual({ ok: false, reason: "invalid" });
    db.answers = [{ data: null, error: null }, { data: null, error: null }, broken];
    expect(await calculateNutrition(input)).toEqual({ ok: false, reason: "failed" });
  });
});

describe("saveCalculatorTarget", () => {
  it("saves the target for the weight through save_calculator_target", async () => {
    expect(await saveCalculatorTarget(70)).toEqual({ ok: true });
    expect(db.calls).toEqual([["rpc", "save_calculator_target", { p_weight_kg: 70 }]]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it.each([24.99, 350.01, Number.POSITIVE_INFINITY, Number.NaN])("refuses a weight of %s", async (weight) => {
    expect(await saveCalculatorTarget(weight)).toEqual({ ok: false, reason: "invalid" });
    expect(db.calls).toEqual([]);
  });

  it("maps 22023 to invalid and anything else to failed", async () => {
    db.answers = [badValue, denied];
    expect(await saveCalculatorTarget(70)).toEqual({ ok: false, reason: "invalid" });
    expect(await saveCalculatorTarget(70)).toEqual({ ok: false, reason: "failed" });
  });
});

describe("chooseNutritionTarget", () => {
  it("picks a trainer's target, or goes back to the latest with null", async () => {
    expect(await chooseNutritionTarget(PAIR)).toEqual({ ok: true });
    expect(await chooseNutritionTarget(null)).toEqual({ ok: true });
    expect(db.calls).toEqual([
      ["rpc", "choose_nutrition_target", { p_coaching_id: PAIR }],
      ["rpc", "choose_nutrition_target", { p_coaching_id: null }],
    ]);
    expect(next.refresh).toHaveBeenCalledTimes(2);
  });

  it("refuses a malformed pair", async () => {
    expect(await chooseNutritionTarget("pair-1")).toEqual({ ok: false, reason: "invalid" });
    expect(db.calls).toEqual([]);
  });

  it("maps 42501 to invalid and anything else to failed", async () => {
    db.answers = [denied, broken];
    expect(await chooseNutritionTarget(PAIR)).toEqual({ ok: false, reason: "invalid" });
    expect(await chooseNutritionTarget(PAIR)).toEqual({ ok: false, reason: "failed" });
  });
});

describe("setPairTarget", () => {
  const target = { coachingId: PAIR, kcal: 2000, proteinG: 130, fatG: 70, carbsG: 210, waterMl: 2400, steps: 10000, confirmLow: false };

  it("sends the trainer's target to set_nutrition_target", async () => {
    expect(await setPairTarget(target)).toEqual({ ok: true });
    expect(db.calls).toEqual([
      [
        "rpc",
        "set_nutrition_target",
        {
          p_coaching_id: PAIR,
          p_kcal: 2000,
          p_protein_g: 130,
          p_fat_g: 70,
          p_carbs_g: 210,
          p_confirm_low: false,
          p_water_ml: 2400,
          p_steps_target: 10000,
        },
      ],
    ]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("passes empty values as null and confirms only on an explicit true", async () => {
    await setPairTarget({ ...target, proteinG: null, fatG: null, carbsG: null, waterMl: null, steps: null, confirmLow: "yes" as unknown as boolean });
    expect(db.calls[0][2]).toMatchObject({ p_protein_g: null, p_fat_g: null, p_carbs_g: null, p_water_ml: null, p_steps_target: null, p_confirm_low: false });
  });

  it("takes the edges of every range", async () => {
    expect(await setPairTarget({ ...target, kcal: 500, proteinG: 0, fatG: 1000, carbsG: 2000, waterMl: 10000, steps: 100000 })).toEqual({ ok: true });
    expect(await setPairTarget({ ...target, kcal: 10000 })).toEqual({ ok: true });
  });

  it.each([
    ["a malformed pair", { coachingId: "p" }],
    ["kcal under 500", { kcal: 499 }],
    ["kcal over 10000", { kcal: 10001 }],
    ["fractional kcal", { kcal: 1999.5 }],
    ["negative protein", { proteinG: -1 }],
    ["fractional fat", { fatG: 70.5 }],
    ["carbs over 2000", { carbsG: 2001 }],
    ["water over 10000", { waterMl: 10001 }],
    ["steps over 100000", { steps: 100001 }],
    ["protein as text", { proteinG: "130" }],
  ])("refuses %s without a call", async (_label, over) => {
    expect(await setPairTarget({ ...target, ...over } as typeof target)).toEqual({ ok: false, reason: "invalid" });
    expect(db.calls).toEqual([]);
  });

  it.each([
    ["an unconfirmed low target", { code: "P0001", message: "low_kcal_unconfirmed" }, "low"],
    ["a closed share or an ended pair", { code: "42501", message: "not_allowed" }, "invalid"],
    ["a value the database refuses", { code: "22023", message: "bad_value" }, "invalid"],
    ["an unknown error", { code: "XX000", message: "internal detail" }, "failed"],
  ])("maps %s to %s", async (_label, error, reason) => {
    db.answers = [{ data: null, error }];
    expect(await setPairTarget(target)).toEqual({ ok: false, reason });
    expect(next.refresh).not.toHaveBeenCalled();
  });
});

describe("clearPairTarget", () => {
  it("removes the trainer's target through clear_nutrition_target", async () => {
    expect(await clearPairTarget(PAIR)).toEqual({ ok: true });
    expect(db.calls).toEqual([["rpc", "clear_nutrition_target", { p_coaching_id: PAIR }]]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("refuses a malformed pair and maps errors", async () => {
    expect(await clearPairTarget("p")).toEqual({ ok: false, reason: "invalid" });
    expect(db.calls).toEqual([]);
    db.answers = [denied, broken];
    expect(await clearPairTarget(PAIR)).toEqual({ ok: false, reason: "invalid" });
    expect(await clearPairTarget(PAIR)).toEqual({ ok: false, reason: "failed" });
  });
});
