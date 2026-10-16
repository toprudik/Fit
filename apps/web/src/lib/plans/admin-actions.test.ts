import { beforeEach, describe, expect, it, vi } from "vitest";

const next = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/cache", () => ({ refresh: next.refresh }));

const USER = "22222222-2222-4222-8222-222222222222";
const GRANT = "33333333-3333-4333-8333-333333333333";

const db = vi.hoisted(() => ({
  calls: [] as { fn: string; args: Record<string, unknown> }[],
  error: null as { message: string; code: string } | null,
  timeZone: "Europe/Moscow" as string | null,
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getClaims: async () => ({ data: { claims: { sub: "admin" } } }) },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { time_zone: db.timeZone } }) }) }),
    }),
    rpc: async (fn: string, args: Record<string, unknown>) => {
      db.calls.push({ fn, args });
      return { data: null, error: db.error };
    },
  }),
}));

const { declineAccessRequest, grantPlan, revokePlan } = await import("./admin-actions");

beforeEach(() => {
  vi.clearAllMocks();
  db.calls = [];
  db.error = null;
  db.timeZone = "Europe/Moscow";
});

describe("grantPlan", () => {
  it("grants without an end with the trimmed reason", async () => {
    expect(await grantPlan({ userId: USER, plan: "trainer_pro", expires: "", reason: "  Beta trainer " })).toEqual({ status: "done" });
    expect(db.calls).toEqual([
      { fn: "admin_grant_plan", args: { p_user_id: USER, p_plan_code: "trainer_pro", p_reason: "Beta trainer", p_expires_at: undefined } },
    ]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("ends the plan at the end of the chosen day in the admin's zone", async () => {
    await grantPlan({ userId: USER, plan: "client_premium", expires: "2099-11-30", reason: "Beta" });
    expect(db.calls[0].args.p_expires_at).toBe("2099-11-30T20:59:59.000Z");
  });

  it("refuses a past date and a free plan before calling the database", async () => {
    expect(await grantPlan({ userId: USER, plan: "client_premium", expires: "2020-01-01", reason: "Beta" })).toEqual({
      status: "invalid-expiry",
    });
    expect(await grantPlan({ userId: USER, plan: "trainer_free", expires: "", reason: "Beta" })).toEqual({ status: "failed" });
    expect(db.calls).toEqual([]);
  });

  it("needs a reason of at least 3 characters (PLAN-5)", async () => {
    expect(await grantPlan({ userId: USER, plan: "trainer_pro", expires: "", reason: " " })).toEqual({ status: "reason-required" });
    expect(await grantPlan({ userId: USER, plan: "trainer_pro", expires: "", reason: "ok" })).toEqual({ status: "reason-short" });
    expect(db.calls).toEqual([]);
  });

  it("tells the admin why the database refused", async () => {
    db.error = { message: "already_granted", code: "P0001" };
    expect(await grantPlan({ userId: USER, plan: "trainer_pro", expires: "", reason: "Beta" })).toEqual({ status: "already" });
    db.error = { message: "not_a_trainer", code: "P0001" };
    expect(await grantPlan({ userId: USER, plan: "trainer_pro", expires: "", reason: "Beta" })).toEqual({ status: "not-trainer" });
    db.error = { message: "boom", code: "XX000" };
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await grantPlan({ userId: USER, plan: "trainer_pro", expires: "", reason: "Beta" })).toEqual({ status: "failed" });
  });
});

describe("revokePlan", () => {
  it("revokes with the reason", async () => {
    expect(await revokePlan({ grantId: GRANT, reason: " Left the beta " })).toEqual({ status: "done" });
    expect(db.calls).toEqual([{ fn: "admin_revoke_plan", args: { p_grant_id: GRANT, p_reason: "Left the beta" } }]);
  });

  it("refreshes when the grant has already ended", async () => {
    db.error = { message: "grant_not_active", code: "P0001" };
    expect(await revokePlan({ grantId: GRANT, reason: "Left" })).toEqual({ status: "not-active" });
    expect(next.refresh).toHaveBeenCalledOnce();
  });
});

describe("declineAccessRequest", () => {
  it("declines an open request and reports one already answered", async () => {
    expect(await declineAccessRequest({ requestId: GRANT })).toEqual({ status: "done" });
    db.error = { message: "request_not_open", code: "P0001" };
    expect(await declineAccessRequest({ requestId: GRANT })).toEqual({ status: "not-open" });
  });
});
