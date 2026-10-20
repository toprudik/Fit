import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const next = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/cache", () => ({ refresh: next.refresh }));

type Answer = { data?: unknown; error?: { message: string; code: string } | null };

/** RPCs called as the signed-in user, and what the next one answers. */
const db = vi.hoisted(() => ({ calls: [] as unknown[][], answer: {} as Answer }));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    rpc: async (fn: string, args: unknown) => {
      db.calls.push([fn, args]);
      return { data: null, error: null, ...db.answer };
    },
  }),
}));

const { saveTrainerReferralBonus } = await import("./actions");

const IDLE = { status: "idle" } as const;

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  Object.assign(db, { calls: [], answer: {} });
});

describe("saveTrainerReferralBonus", () => {
  it("saves a month of Pro without a percent and refreshes", async () => {
    expect(await saveTrainerReferralBonus(IDLE, form({ kind: "plan_month", percent: "50" }))).toEqual({ status: "saved" });
    expect(db.calls).toEqual([["admin_set_trainer_referral_bonus", { p_kind: "plan_month", p_discount_percent: undefined }]]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("reads an unknown or missing kind as a month of Pro", async () => {
    await saveTrainerReferralBonus(IDLE, form({ kind: "free_year" }));
    await saveTrainerReferralBonus(IDLE, form({}));
    expect(db.calls.map((call) => (call[1] as { p_kind: string }).p_kind)).toEqual(["plan_month", "plan_month"]);
  });

  it("saves a discount of 1 to 100 percent, a trailing % allowed", async () => {
    for (const percent of ["1", " 100 ", "25%"]) {
      expect(await saveTrainerReferralBonus(IDLE, form({ kind: "plan_discount", percent }))).toEqual({ status: "saved" });
    }
    expect(db.calls.map((call) => call[1])).toEqual([
      { p_kind: "plan_discount", p_discount_percent: 1 },
      { p_kind: "plan_discount", p_discount_percent: 100 },
      { p_kind: "plan_discount", p_discount_percent: 25 },
    ]);
  });

  it.each(["", "0", "101", "12.5", "-5", "abc"])("refuses a discount of %j and keeps what was typed, without a call", async (percent) => {
    expect(await saveTrainerReferralBonus(IDLE, form({ kind: "plan_discount", percent }))).toEqual({ status: "invalid", percent });
    expect(db.calls).toEqual([]);
  });

  it("reports a refusal, a caller who is not an admin included, keeping the form", async () => {
    db.answer = { error: { message: "forbidden", code: "42501" } };
    expect(await saveTrainerReferralBonus(IDLE, form({ kind: "plan_discount", percent: "30" }))).toEqual({
      status: "failed",
      kind: "plan_discount",
      percent: "30",
    });
    expect(next.refresh).not.toHaveBeenCalled();
  });
});
