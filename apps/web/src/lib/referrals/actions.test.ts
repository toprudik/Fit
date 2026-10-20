import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const next = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/cache", () => ({ refresh: next.refresh }));

type Answer = { data?: unknown; error?: { message: string; code: string } | null };

/** Every query and RPC made as the signed-in user, and what they answer: keyed by table or "rpc:<name>". */
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
    for (const step of ["select", "eq", "maybeSingle"]) {
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
      rpc: (fn: string, args?: unknown) => query(`rpc:${fn}`, args === undefined ? ["rpc", fn] : ["rpc", fn, args]),
    }),
  };
});

const { declineReferral, saveReferralOffer, stopReferralOffer } = await import("./actions");

const IDLE = { status: "idle" } as const;
const PACKAGE = "00000000-0000-4000-8000-000000000001";
const REFERRAL = "00000000-0000-4000-8000-000000000002";
const UNKNOWN = { message: "something internal broke", code: "XX000" };
const BLANK = { referrer: "", referee: "", condition: "", amount: "", package: "", until: "" };

function form(values: Partial<Record<keyof typeof BLANK, string>>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

const rpcs = () => db.calls.filter((call) => call[0] === "rpc");

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  Object.assign(db, { userId: "trainer-1", calls: [], answers: {} });
});

describe("saveReferralOffer", () => {
  it("starts an offer without a condition: no friend bonus means 0 sessions", async () => {
    expect(await saveReferralOffer(IDLE, form({ referrer: " 1 ", referee: "", condition: "" }))).toEqual({ status: "saved" });
    expect(db.calls).toEqual([
      [
        "rpc",
        "save_referral_offer",
        {
          p_referrer_sessions: 1,
          p_referee_sessions: 0,
          p_min_amount_minor: undefined,
          p_currency: undefined,
          p_package_id: undefined,
          p_active_to: undefined,
        },
      ],
    ]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("puts a minimal sum in the trainer's currency", async () => {
    db.answers.trainer_profiles = { data: { default_currency: "RUB" } };
    expect(await saveReferralOffer(IDLE, form({ referrer: "5", referee: "5", condition: "amount", amount: "10 000", until: "2026-12-31" }))).toEqual({
      status: "saved",
    });
    expect(db.calls).toEqual([
      ["trainer_profiles", "select", "default_currency", "eq", "user_id", "trainer-1", "maybeSingle"],
      [
        "rpc",
        "save_referral_offer",
        {
          p_referrer_sessions: 5,
          p_referee_sessions: 5,
          p_min_amount_minor: 1000000,
          p_currency: "RUB",
          p_package_id: undefined,
          p_active_to: "2026-12-31",
        },
      ],
    ]);
  });

  it("ties the offer to one package and ignores the amount field", async () => {
    await saveReferralOffer(IDLE, form({ referrer: "2", referee: "1", condition: "package", package: PACKAGE, amount: "500" }));
    expect(rpcs()[0]?.[2]).toMatchObject({ p_package_id: PACKAGE, p_min_amount_minor: undefined, p_currency: undefined });
    expect(db.calls.some((call) => call[0] === "trainer_profiles")).toBe(false);
  });

  it("names each bad field, keeps the trimmed form and calls nothing", async () => {
    const state = await saveReferralOffer(IDLE, form({ referrer: "0", referee: "6", condition: "amount", amount: "0", until: "31.12.2026" }));
    expect(state).toEqual({
      status: "invalid",
      fields: ["referrer", "referee", "amount", "until"],
      values: { ...BLANK, referrer: "0", referee: "6", condition: "amount", amount: "0", until: "31.12.2026" },
    });
    expect(await saveReferralOffer(IDLE, form({ referrer: "1", condition: "package", package: "  " }))).toMatchObject({ status: "invalid", fields: ["package"] });
    expect(db.calls).toEqual([]);
  });

  it.each(["", "6", "1.5", "-1", "10", "abc"])("refuses %j sessions for the referrer", async (referrer) => {
    expect(await saveReferralOffer(IDLE, form({ referrer }))).toMatchObject({ status: "invalid", fields: ["referrer"] });
    expect(db.calls).toEqual([]);
  });

  it("refuses an amount that is not a sum", async () => {
    expect(await saveReferralOffer(IDLE, form({ referrer: "1", condition: "amount", amount: "много" }))).toMatchObject({ status: "invalid", fields: ["amount"] });
  });

  it("starts nothing when the trainer profile is not readable", async () => {
    db.userId = null;
    expect(await saveReferralOffer(IDLE, form({ referrer: "1", condition: "amount", amount: "1000" }))).toMatchObject({ status: "failed", reason: "failed" });
    db.userId = "trainer-1";
    db.answers.trainer_profiles = { error: UNKNOWN };
    expect(await saveReferralOffer(IDLE, form({ referrer: "1", condition: "amount", amount: "1000" }))).toMatchObject({ status: "failed", reason: "failed" });
    expect(rpcs()).toEqual([]);
  });

  it("maps a refused offer, a missing plan and other failures, keeping the form", async () => {
    db.answers["rpc:save_referral_offer"] = [
      { error: { message: "offer_invalid", code: "P0001" } },
      { error: { message: "plan_required", code: "P0001" } },
      { error: UNKNOWN },
    ];
    const values = { ...BLANK, referrer: "1", until: "2026-10-01" };
    expect(await saveReferralOffer(IDLE, form(values))).toEqual({ status: "invalid", fields: ["until"], values });
    expect(await saveReferralOffer(IDLE, form(values))).toEqual({ status: "failed", reason: "plan", values });
    expect(await saveReferralOffer(IDLE, form(values))).toEqual({ status: "failed", reason: "failed", values });
    expect(next.refresh).not.toHaveBeenCalled();
  });
});

describe("stopReferralOffer", () => {
  it("stops the live offer and refreshes", async () => {
    expect(await stopReferralOffer()).toEqual({ failed: false });
    expect(db.calls).toEqual([["rpc", "stop_referral_offer"]]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("reports a failure", async () => {
    db.answers["rpc:stop_referral_offer"] = { error: UNKNOWN };
    expect(await stopReferralOffer()).toEqual({ failed: true });
    expect(next.refresh).not.toHaveBeenCalled();
  });
});

describe("declineReferral", () => {
  it("declines the referral and refreshes", async () => {
    expect(await declineReferral(REFERRAL)).toEqual({ failed: false });
    expect(db.calls).toEqual([["rpc", "decline_referral", { p_referral_id: REFERRAL }]]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("reports a failure, someone else's referral included", async () => {
    db.answers["rpc:decline_referral"] = { error: { message: "referral_not_found", code: "P0002" } };
    expect(await declineReferral(REFERRAL)).toEqual({ failed: true });
    expect(next.refresh).not.toHaveBeenCalled();
  });
});
