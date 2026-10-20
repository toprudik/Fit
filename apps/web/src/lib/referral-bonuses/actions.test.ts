import { beforeEach, describe, expect, it, vi } from "vitest";

const next = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/cache", () => ({ refresh: next.refresh }));

const BONUS = "44444444-4444-4444-8444-444444444444";

const db = vi.hoisted(() => ({
  calls: [] as { fn: string; args: Record<string, unknown> }[],
  error: null as { message: string; code: string } | null,
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    rpc: async (fn: string, args: Record<string, unknown>) => {
      db.calls.push({ fn, args });
      return { data: null, error: db.error };
    },
  }),
}));

const { grantReferralBonus } = await import("./actions");

beforeEach(() => {
  vi.clearAllMocks();
  db.calls = [];
  db.error = null;
});

describe("grantReferralBonus", () => {
  it("gives the month from the chosen day and refreshes the list", async () => {
    expect(await grantReferralBonus({ bonusId: BONUS, startsOn: "2027-02-01" })).toEqual({ status: "done" });
    expect(db.calls).toEqual([{ fn: "admin_grant_referral_bonus", args: { p_bonus_id: BONUS, p_starts_on: "2027-02-01" } }]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("refuses a malformed day or bonus before calling the database", async () => {
    expect(await grantReferralBonus({ bonusId: BONUS, startsOn: "1.02.2027" })).toEqual({ status: "invalid-start" });
    expect(await grantReferralBonus({ bonusId: "nope", startsOn: "2027-02-01" })).toEqual({ status: "failed" });
    expect(db.calls).toEqual([]);
  });

  it.each([
    ["bonus_not_due", "not-due", true],
    ["bonus_not_pending", "not-pending", true],
    ["bonus_not_found", "not-pending", true],
    ["bonus_kind_unsupported", "unsupported", false],
    ["invalid_start", "invalid-start", false],
    ["something else", "failed", false],
  ])("maps %s to %s", async (message, status, refreshes) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    db.error = { message, code: "P0001" };
    expect(await grantReferralBonus({ bonusId: BONUS, startsOn: "2027-02-01" })).toEqual({ status });
    expect(next.refresh).toHaveBeenCalledTimes(refreshes ? 1 : 0);
  });
});
