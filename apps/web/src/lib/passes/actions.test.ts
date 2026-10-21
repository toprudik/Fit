import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const next = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/cache", () => ({ refresh: next.refresh }));

type Answer = { data?: unknown; error?: { message: string; code: string } | null; count?: number | null };

/**
 * Every query and RPC made as the signed-in user, step by step, and what they answer: keyed by table or
 * "rpc:<name>"; an array answers one call per item, in order.
 */
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
    for (const step of ["select", "insert", "update", "delete", "eq", "neq", "maybeSingle", "single"]) {
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
      rpc: (fn: string, args?: unknown) => query(`rpc:${fn}`, ["rpc", fn, args]),
    }),
  };
});

const actions = await import("./actions");

const PAIR = "00000000-0000-4000-8000-000000000001";
const PASS = "00000000-0000-4000-8000-000000000002";
const PACKAGE = "00000000-0000-4000-8000-000000000003";
const FREEZE = "00000000-0000-4000-8000-000000000004";
const PAYMENT = "00000000-0000-4000-8000-000000000005";
const CHARGE = "00000000-0000-4000-8000-000000000006";
const UNKNOWN = { message: "something internal broke", code: "XX000" };

/** A past day of the trainer (Europe/Moscow, UTC+3): a payment then is entered at local noon. */
const PAID_ON = "2026-10-10";
const PAID_AT = "2026-10-10T09:00:00.000Z";

const rpcs = () => db.calls.filter((call) => call[0] === "rpc");
const writes = () => db.calls.filter((call) => call.some((step) => step === "insert" || step === "update" || step === "delete"));

beforeAll(() => {
  vi.useFakeTimers({ now: new Date("2026-10-18T09:00:00Z"), toFake: ["Date"] });
});
afterAll(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  Object.assign(db, { userId: "trainer-1", calls: [], answers: {} });
});

describe("sellPass", () => {
  const fromPackage = { coachingId: PAIR, startsOn: "2026-10-18", note: "  ", source: { kind: "package" as const, packageId: PACKAGE }, payment: null };
  const custom = {
    kind: "custom" as const,
    title: " 10 занятий ",
    sessions: 10,
    price: "18 000",
    validity: "60",
    appliesTo: "personal" as const,
  };

  it("sells a package pass in one RPC and returns the pass and the settled debt", async () => {
    db.answers["rpc:create_pass"] = { data: [{ pass_id: PASS, settled: 2 }] };
    expect(await actions.sellPass(fromPackage)).toEqual({ status: "sold", passId: PASS, settled: 2 });
    expect(rpcs()).toEqual([["rpc", "create_pass", { p_coaching_id: PAIR, p_starts_on: "2026-10-18", p_note: undefined, p_package_id: PACKAGE }]]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("sells custom terms in the trainer's currency with the payment at local noon", async () => {
    db.answers.trainer_profiles = { data: { default_currency: "KZT" } };
    db.answers["rpc:create_pass"] = { data: [{ pass_id: PASS, settled: 0 }] };
    const result = await actions.sellPass({
      ...fromPackage,
      note: " Первый ",
      source: custom,
      payment: { amount: "5 000", method: "sbp", paidOn: PAID_ON },
    });
    expect(result).toEqual({ status: "sold", passId: PASS, settled: 0 });
    expect(db.calls).toContainEqual(["trainer_profiles", "select", "default_currency", "eq", "user_id", "trainer-1", "maybeSingle"]);
    expect(rpcs()).toEqual([
      [
        "rpc",
        "create_pass",
        {
          p_coaching_id: PAIR,
          p_starts_on: "2026-10-18",
          p_note: "Первый",
          p_title: "10 занятий",
          p_sessions: 10,
          p_price_minor: 1800000,
          p_currency: "KZT",
          p_validity_days: 60,
          p_applies_to: "personal",
          p_payment_minor: 500000,
          p_payment_method: "sbp",
          p_paid_at: PAID_AT,
        },
      ],
    ]);
  });

  it("passes the form's request key, so a repeated submit sells nothing new", async () => {
    db.answers["rpc:create_pass"] = { data: [{ pass_id: PASS, settled: 0 }] };
    const requestId = "7d1f9a2e-3b4c-4d5e-8f6a-0b1c2d3e4f5a";
    await actions.sellPass({ ...fromPackage, requestId });
    expect(rpcs()[0]?.[2]).toMatchObject({ p_request_id: requestId });
    expect(await actions.sellPass({ ...fromPackage, requestId: "again" })).toEqual({ status: "invalid", fields: ["requestId"] });
    db.answers["rpc:create_pass"] = { data: null, error: { message: "request_reused", code: "P0001" } };
    expect(await actions.sellPass({ ...fromPackage, requestId })).toEqual({ status: "stale" });
  });

  it("sends no validity for a pass without expiry", async () => {
    db.answers.trainer_profiles = { data: { default_currency: "RUB" } };
    db.answers["rpc:create_pass"] = { data: [{ pass_id: PASS, settled: 0 }] };
    await actions.sellPass({ ...fromPackage, source: { ...custom, validity: "" } });
    expect(rpcs()[0]?.[2]).toMatchObject({ p_validity_days: undefined });
  });

  it("names each refused field and calls nothing", async () => {
    expect(
      await actions.sellPass({ coachingId: "pair-1", startsOn: "2026-02-30", note: "", source: { kind: "package", packageId: "nope" }, payment: null }),
    ).toEqual({ status: "invalid", fields: ["coachingId", "startsOn", "source.packageId"] });
    expect(
      await actions.sellPass({
        ...fromPackage,
        source: { ...custom, title: "x".repeat(121), sessions: 201, price: "abc", validity: "45", appliesTo: "solo" as never },
      }),
    ).toEqual({ status: "invalid", fields: ["source.title", "source.sessions", "source.price", "source.validity", "source.appliesTo"] });
    expect(await actions.sellPass({ ...fromPackage, note: "x".repeat(501) })).toEqual({ status: "invalid", fields: ["note"] });
    expect(await actions.sellPass({ ...fromPackage, payment: { amount: "0", method: "card" as never, paidOn: "2026-10-32" } })).toEqual({
      status: "invalid",
      fields: ["payment.amount", "payment.method", "payment.paidOn"],
    });
    expect(db.calls).toEqual([]);
  });

  it("takes the edges of sessions and title length", async () => {
    db.answers.trainer_profiles = { data: { default_currency: "RUB" } };
    db.answers["rpc:create_pass"] = { data: [{ pass_id: PASS, settled: 0 }] };
    expect(await actions.sellPass({ ...fromPackage, source: { ...custom, sessions: 200, title: "x".repeat(120) } })).toMatchObject({ status: "sold" });
    expect(await actions.sellPass({ ...fromPackage, source: { ...custom, sessions: 0 } })).toEqual({ status: "invalid", fields: ["source.sessions"] });
  });

  it("sells nothing when nobody is signed in or the seller has no trainer profile", async () => {
    db.userId = null;
    expect(await actions.sellPass(fromPackage)).toEqual({ status: "failed" });
    db.userId = "client-1";
    expect(await actions.sellPass({ ...fromPackage, source: custom })).toEqual({ status: "failed" });
    expect(rpcs()).toEqual([]);
  });

  it("maps an ended pair, a gone package and anything else apart", async () => {
    db.answers["rpc:create_pass"] = [
      { error: { message: "coaching_ended", code: "P0001" } },
      { error: { message: "package_not_found", code: "P0001" } },
      { error: { message: "pass_invalid", code: "P0001" } },
      { error: UNKNOWN },
      { data: [] },
    ];
    expect(await actions.sellPass(fromPackage)).toEqual({ status: "refused", reason: "ended" });
    expect(await actions.sellPass(fromPackage)).toEqual({ status: "invalid", fields: ["source"] });
    expect(await actions.sellPass(fromPackage)).toEqual({ status: "invalid", fields: ["source"] });
    expect(await actions.sellPass(fromPackage)).toEqual({ status: "failed" });
    expect(await actions.sellPass(fromPackage)).toEqual({ status: "failed" });
    expect(next.refresh).not.toHaveBeenCalled();
  });
});

describe("cancelPass", () => {
  it("cancels with the trimmed reason", async () => {
    expect(await actions.cancelPass({ passId: PASS, reason: "  Переезд  " })).toEqual({ status: "done" });
    expect(rpcs()).toEqual([["rpc", "cancel_pass", { p_pass_id: PASS, p_reason: "Переезд" }]]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("needs a reason of 1 to 500 characters and a pass id", async () => {
    expect(await actions.cancelPass({ passId: PASS, reason: "   " })).toEqual({ status: "invalid", fields: ["reason"] });
    expect(await actions.cancelPass({ passId: PASS, reason: "x".repeat(501) })).toEqual({ status: "invalid", fields: ["reason"] });
    expect(await actions.cancelPass({ passId: "pass-1", reason: "x" })).toEqual({ status: "invalid", fields: ["passId"] });
    expect(db.calls).toEqual([]);
    expect(await actions.cancelPass({ passId: PASS, reason: "x".repeat(500) })).toEqual({ status: "done" });
  });

  it("reports a database error as failed", async () => {
    db.answers["rpc:cancel_pass"] = { error: UNKNOWN };
    expect(await actions.cancelPass({ passId: PASS, reason: "x" })).toEqual({ status: "failed" });
    expect(next.refresh).not.toHaveBeenCalled();
  });
});

describe("deletePass", () => {
  it("deletes the pass", async () => {
    db.answers.passes = { data: [{ id: PASS }] };
    expect(await actions.deletePass(PASS)).toEqual({ status: "done" });
    expect(db.calls).toEqual([["passes", "delete", "eq", "id", PASS, "select", "id"]]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("refuses a malformed id without a query", async () => {
    expect(await actions.deletePass("1; drop table passes")).toEqual({ status: "failed" });
    expect(db.calls).toEqual([]);
  });

  it("tells a pass in use, a gone pass and other errors apart", async () => {
    db.answers.passes = [{ error: { message: "pass_in_use", code: "P0001" } }, { data: [] }, { error: UNKNOWN }];
    expect(await actions.deletePass(PASS)).toEqual({ status: "refused", reason: "in-use" });
    expect(await actions.deletePass(PASS)).toEqual({ status: "stale" });
    expect(await actions.deletePass(PASS)).toEqual({ status: "failed" });
    expect(next.refresh).not.toHaveBeenCalled();
  });
});

describe("changeExpiry", () => {
  it("sets a new last day with the reason", async () => {
    expect(await actions.changeExpiry({ passId: PASS, lastDay: "2026-12-31", reason: " Болезнь " })).toEqual({ status: "done" });
    expect(rpcs()).toEqual([["rpc", "change_pass_expiry", { p_pass_id: PASS, p_last_day: "2026-12-31", p_reason: "Болезнь" }]]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("removes the expiry with a null day", async () => {
    await actions.changeExpiry({ passId: PASS, lastDay: null, reason: "Без срока" });
    expect(rpcs()[0]?.[2]).toEqual({ p_pass_id: PASS, p_last_day: null, p_reason: "Без срока" });
  });

  it("refuses an impossible day or a missing reason without a call", async () => {
    expect(await actions.changeExpiry({ passId: PASS, lastDay: "2026-02-29", reason: "" })).toEqual({ status: "invalid", fields: ["lastDay", "reason"] });
    expect(db.calls).toEqual([]);
  });

  it("maps a bad range, a cancelled pass and other errors", async () => {
    db.answers["rpc:change_pass_expiry"] = [
      { error: { message: "invalid_range", code: "P0001" } },
      { error: { message: "pass_cancelled", code: "P0001" } },
      { error: UNKNOWN },
    ];
    const input = { passId: PASS, lastDay: "2026-01-01", reason: "x" };
    expect(await actions.changeExpiry(input)).toEqual({ status: "refused", reason: "range" });
    expect(await actions.changeExpiry(input)).toEqual({ status: "refused", reason: "cancelled" });
    expect(await actions.changeExpiry(input)).toEqual({ status: "failed" });
  });
});

describe("addFreeze", () => {
  it("inserts the days as a half-open period", async () => {
    db.answers.pass_freezes = { data: [{ id: FREEZE }] };
    expect(await actions.addFreeze({ passId: PASS, from: "2026-11-01", to: "2026-11-07", reason: "  " })).toEqual({ status: "done" });
    expect(db.calls).toEqual([["pass_freezes", "insert", { pass_id: PASS, period: "[2026-11-01,2026-11-08)", reason: null }, "select", "id"]]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("takes a one-day freeze and keeps a trimmed reason", async () => {
    db.answers.pass_freezes = { data: [{ id: FREEZE }] };
    await actions.addFreeze({ passId: PASS, from: "2026-11-01", to: "2026-11-01", reason: " Отпуск " });
    expect(db.calls[0]?.[2]).toEqual({ pass_id: PASS, period: "[2026-11-01,2026-11-02)", reason: "Отпуск" });
  });

  it("refuses an end before the start without a write", async () => {
    expect(await actions.addFreeze({ passId: PASS, from: "2026-11-07", to: "2026-11-01", reason: "" })).toEqual({ status: "invalid", fields: ["to"] });
    expect(await actions.addFreeze({ passId: PASS, from: "07.11.2026", to: "2026-11-01", reason: "" })).toEqual({ status: "invalid", fields: ["from"] });
    expect(db.calls).toEqual([]);
  });

  it("tells an overlapping freeze from other failures", async () => {
    db.answers.pass_freezes = [{ error: { message: "conflicting key value", code: "23P01" } }, { error: UNKNOWN }, { data: [] }];
    const input = { passId: PASS, from: "2026-11-01", to: "2026-11-07", reason: "" };
    expect(await actions.addFreeze(input)).toEqual({ status: "refused", reason: "overlap" });
    expect(await actions.addFreeze(input)).toEqual({ status: "failed" });
    expect(await actions.addFreeze(input)).toEqual({ status: "failed" });
    expect(next.refresh).not.toHaveBeenCalled();
  });
});

describe("endFreeze", () => {
  const running = { data: { period: "[2026-10-10,2026-10-25)" } };

  it("keeps the first day and ends the freeze on the given day", async () => {
    db.answers.pass_freezes = [running, { data: [{ id: FREEZE }] }];
    expect(await actions.endFreeze({ freezeId: FREEZE, lastDay: "2026-10-18" })).toEqual({ status: "done" });
    expect(db.calls).toEqual([
      ["pass_freezes", "select", "period", "eq", "id", FREEZE, "maybeSingle"],
      ["pass_freezes", "update", { period: "[2026-10-10,2026-10-19)" }, "eq", "id", FREEZE, "select", "id"],
    ]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("refuses a last day before the first, without an update", async () => {
    db.answers.pass_freezes = running;
    expect(await actions.endFreeze({ freezeId: FREEZE, lastDay: "2026-10-09" })).toEqual({ status: "refused", reason: "range" });
    expect(writes()).toEqual([]);
  });

  it("reads a gone freeze as stale and a read error as failed", async () => {
    db.answers.pass_freezes = [{ data: null }, { error: UNKNOWN }];
    expect(await actions.endFreeze({ freezeId: FREEZE, lastDay: "2026-10-18" })).toEqual({ status: "stale" });
    expect(await actions.endFreeze({ freezeId: FREEZE, lastDay: "2026-10-18" })).toEqual({ status: "failed" });
    expect(writes()).toEqual([]);
  });

  it("maps a refused update to range, no row to stale, others to failed", async () => {
    db.answers.pass_freezes = [running, { error: { message: "new row violates policy", code: "42501" } }, running, { data: [] }, running, { error: UNKNOWN }];
    const input = { freezeId: FREEZE, lastDay: "2026-10-18" };
    expect(await actions.endFreeze(input)).toEqual({ status: "refused", reason: "range" });
    expect(await actions.endFreeze(input)).toEqual({ status: "stale" });
    expect(await actions.endFreeze(input)).toEqual({ status: "failed" });
  });

  it("refuses bad input without a query", async () => {
    expect(await actions.endFreeze({ freezeId: "f", lastDay: "2026-13-01" })).toEqual({ status: "invalid", fields: ["freezeId", "lastDay"] });
    expect(db.calls).toEqual([]);
  });
});

describe("removeFreeze", () => {
  it("deletes a freeze that has not started", async () => {
    db.answers.pass_freezes = { data: [{ id: FREEZE }] };
    expect(await actions.removeFreeze(FREEZE)).toEqual({ status: "done" });
    expect(db.calls).toEqual([["pass_freezes", "delete", "eq", "id", FREEZE, "select", "id"]]);
  });

  it("refuses a malformed id and reports gone and failed", async () => {
    expect(await actions.removeFreeze("freeze-1")).toEqual({ status: "failed" });
    expect(db.calls).toEqual([]);
    db.answers.pass_freezes = [{ data: [] }, { error: UNKNOWN }];
    expect(await actions.removeFreeze(FREEZE)).toEqual({ status: "stale" });
    expect(await actions.removeFreeze(FREEZE)).toEqual({ status: "failed" });
    expect(next.refresh).not.toHaveBeenCalled();
  });
});

describe("recordPayment", () => {
  const input = { coachingId: PAIR, passId: PASS, direction: "in" as const, payment: { amount: "3 500,50", method: "cash" as const, paidOn: PAID_ON }, note: "" };

  it("records a confirmed payment for a pass in the pass's currency", async () => {
    db.answers.passes = { data: { currency: "RUB" } };
    db.answers.coachings = { data: { client_id: "client-1" } };
    expect(await actions.recordPayment(input)).toEqual({ status: "done" });
    expect(db.calls).toContainEqual(["passes", "select", "currency", "eq", "id", PASS, "maybeSingle"]);
    expect(db.calls).toContainEqual(["coachings", "select", "client_id", "eq", "id", PAIR, "eq", "trainer_id", "trainer-1", "maybeSingle"]);
    expect(writes()).toEqual([
      [
        "payments",
        "insert",
        {
          coaching_id: PAIR,
          trainer_id: "trainer-1",
          client_id: "client-1",
          pass_id: PASS,
          direction: "in",
          amount_minor: 350050,
          currency: "RUB",
          method: "cash",
          paid_at: PAID_AT,
          status: "confirmed",
          note: null,
        },
      ],
    ]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("puts money on account in the trainer's default currency", async () => {
    db.answers.trainer_profiles = { data: { default_currency: "USD" } };
    db.answers.coachings = { data: { client_id: "client-1" } };
    await actions.recordPayment({ ...input, passId: null, direction: "refund", note: " Возврат " });
    expect(db.calls).toContainEqual(["trainer_profiles", "select", "default_currency", "eq", "user_id", "trainer-1", "maybeSingle"]);
    expect(writes()[0]?.[2]).toMatchObject({ pass_id: null, direction: "refund", currency: "USD", note: "Возврат" });
  });

  it("writes nothing for someone else's pair or a pass without a currency", async () => {
    db.answers.passes = { data: { currency: "RUB" } };
    expect(await actions.recordPayment(input)).toEqual({ status: "stale" });
    db.answers.passes = { data: null };
    db.answers.coachings = { data: { client_id: "client-1" } };
    expect(await actions.recordPayment(input)).toEqual({ status: "stale" });
    expect(writes()).toEqual([]);
  });

  it("refuses a zero amount and an unknown direction without a query", async () => {
    expect(await actions.recordPayment({ ...input, direction: "out" as never, payment: { ...input.payment, amount: "0" } })).toEqual({
      status: "invalid",
      fields: ["direction", "payment.amount"],
    });
    expect(db.calls).toEqual([]);
  });

  it("needs a session and reports an insert error as failed", async () => {
    db.userId = null;
    expect(await actions.recordPayment(input)).toEqual({ status: "failed" });
    db.userId = "trainer-1";
    db.answers.passes = { data: { currency: "RUB" } };
    db.answers.coachings = { data: { client_id: "client-1" } };
    db.answers.payments = { error: UNKNOWN };
    expect(await actions.recordPayment(input)).toEqual({ status: "failed" });
    expect(next.refresh).not.toHaveBeenCalled();
  });
});

describe("confirmPayment", () => {
  const SEEN = "2026-10-17T10:00:00.000Z";

  it("confirms only the reported version the trainer saw", async () => {
    db.answers.payments = { data: [{ id: PAYMENT }] };
    expect(await actions.confirmPayment(PAYMENT, SEEN)).toEqual({ status: "done" });
    expect(db.calls).toEqual([
      ["payments", "update", { status: "confirmed" }, "eq", "id", PAYMENT, "eq", "status", "reported", "eq", "updated_at", SEEN, "select", "id"],
    ]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("reloads the screen when the report changed meanwhile", async () => {
    db.answers.payments = { data: [] };
    expect(await actions.confirmPayment(PAYMENT, SEEN)).toEqual({ status: "stale" });
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("refuses a malformed id or no version without a query, and reports errors", async () => {
    expect(await actions.confirmPayment("payment-1", SEEN)).toEqual({ status: "failed" });
    expect(await actions.confirmPayment(PAYMENT, "")).toEqual({ status: "failed" });
    expect(db.calls).toEqual([]);
    db.answers.payments = { error: UNKNOWN };
    expect(await actions.confirmPayment(PAYMENT, SEEN)).toEqual({ status: "failed" });
  });
});

describe("correctPayment", () => {
  const input = { paymentId: PAYMENT, payment: { amount: "2000", method: "bank_transfer" as const, paidOn: PAID_ON }, reason: " Опечатка " };

  it("keeps the entered time when the day stays the same", async () => {
    db.answers.payments = { data: { paid_at: "2026-10-10T15:42:00.000Z" } };
    expect(await actions.correctPayment(input)).toEqual({ status: "done" });
    expect(rpcs()).toEqual([
      [
        "rpc",
        "correct_payment",
        { p_payment_id: PAYMENT, p_amount_minor: 200000, p_method: "bank_transfer", p_paid_at: "2026-10-10T15:42:00.000Z", p_reason: "Опечатка" },
      ],
    ]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("moves the payment to noon of a new day", async () => {
    db.answers.payments = { data: { paid_at: "2026-10-01T15:42:00.000Z" } };
    await actions.correctPayment(input);
    expect(rpcs()[0]?.[2]).toMatchObject({ p_paid_at: PAID_AT });
  });

  it("reads a gone payment as stale, before and inside the RPC", async () => {
    expect(await actions.correctPayment(input)).toEqual({ status: "stale" });
    expect(rpcs()).toEqual([]);
    db.answers.payments = { data: { paid_at: PAID_AT } };
    db.answers["rpc:correct_payment"] = { error: { message: "payment_not_found", code: "P0002" } };
    expect(await actions.correctPayment(input)).toEqual({ status: "stale" });
  });

  it("needs a session, a reason and reports other errors as failed", async () => {
    expect(await actions.correctPayment({ ...input, reason: "" })).toEqual({ status: "invalid", fields: ["reason"] });
    db.userId = null;
    expect(await actions.correctPayment(input)).toEqual({ status: "failed" });
    expect(db.calls).toEqual([]);
    db.userId = "trainer-1";
    db.answers.payments = { data: { paid_at: PAID_AT } };
    db.answers["rpc:correct_payment"] = { error: UNKNOWN };
    expect(await actions.correctPayment(input)).toEqual({ status: "failed" });
  });
});

describe("voidPayment", () => {
  it("voids a payment that is not voided yet, with the reason", async () => {
    db.answers.payments = { data: [{ id: PAYMENT }] };
    expect(await actions.voidPayment({ paymentId: PAYMENT, reason: " Дубль " })).toEqual({ status: "done" });
    expect(db.calls).toEqual([["payments", "update", { status: "voided", void_reason: "Дубль" }, "eq", "id", PAYMENT, "neq", "status", "voided", "select", "id"]]);
  });

  it("refuses no reason, reads no row as stale and an error as failed", async () => {
    expect(await actions.voidPayment({ paymentId: PAYMENT, reason: " " })).toEqual({ status: "invalid", fields: ["reason"] });
    expect(db.calls).toEqual([]);
    db.answers.payments = [{ data: [] }, { error: UNKNOWN }];
    expect(await actions.voidPayment({ paymentId: PAYMENT, reason: "x" })).toEqual({ status: "stale" });
    expect(await actions.voidPayment({ paymentId: PAYMENT, reason: "x" })).toEqual({ status: "failed" });
    expect(next.refresh).not.toHaveBeenCalled();
  });
});

describe("reportPayment", () => {
  const input = { passId: PASS, payment: { amount: "1000", method: "sbp" as const, paidOn: PAID_ON }, note: " Перевёл " };

  it("reports a payment on the client's own pass, dated in the trainer's zone", async () => {
    db.userId = "client-1";
    db.answers.passes = { data: { coaching_id: PAIR, trainer_id: "trainer-1", currency: "RUB" } };
    db.answers.public_profiles = { data: { time_zone: "Asia/Yekaterinburg" } };
    expect(await actions.reportPayment(input)).toEqual({ status: "done" });
    expect(db.calls).toContainEqual(["passes", "select", "coaching_id, trainer_id, currency", "eq", "id", PASS, "eq", "client_id", "client-1", "maybeSingle"]);
    expect(writes()).toEqual([
      [
        "payments",
        "insert",
        {
          coaching_id: PAIR,
          trainer_id: "trainer-1",
          client_id: "client-1",
          pass_id: PASS,
          direction: "in",
          amount_minor: 100000,
          currency: "RUB",
          method: "sbp",
          paid_at: "2026-10-10T07:00:00.000Z",
          status: "reported",
          note: "Перевёл",
        },
      ],
    ]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("falls back to the client's zone when the trainer's is not readable", async () => {
    db.userId = "client-1";
    db.answers.profiles = { data: { time_zone: "Europe/Moscow" } };
    db.answers.passes = { data: { coaching_id: PAIR, trainer_id: "trainer-1", currency: "RUB" } };
    await actions.reportPayment(input);
    expect(writes()[0]?.[2]).toMatchObject({ paid_at: PAID_AT });
  });

  it("writes nothing for a pass that is not the client's, or without a session", async () => {
    db.userId = "client-1";
    expect(await actions.reportPayment(input)).toEqual({ status: "stale" });
    db.userId = null;
    expect(await actions.reportPayment(input)).toEqual({ status: "failed" });
    expect(writes()).toEqual([]);
  });

  it("refuses a negative amount and reports an insert error as failed", async () => {
    expect(await actions.reportPayment({ ...input, payment: { ...input.payment, amount: "-5" } })).toEqual({ status: "invalid", fields: ["payment.amount"] });
    expect(db.calls).toEqual([]);
    db.userId = "client-1";
    db.answers.passes = { data: { coaching_id: PAIR, trainer_id: "trainer-1", currency: "RUB" } };
    db.answers.payments = { error: UNKNOWN };
    expect(await actions.reportPayment(input)).toEqual({ status: "failed" });
  });

  it("says a report already waits when the database refuses a second one (QA B1)", async () => {
    db.userId = "client-1";
    db.answers.passes = { data: { coaching_id: PAIR, trainer_id: "trainer-1", currency: "RUB" } };
    db.answers.payments = { error: { code: "P0001", message: "payment_already_reported" } };
    expect(await actions.reportPayment(input)).toEqual({ status: "already" });
    expect(next.refresh).not.toHaveBeenCalled();
  });
});

describe("withdrawReport", () => {
  it("voids only a report that is still waiting", async () => {
    db.userId = "client-1";
    db.answers.payments = { data: [{ id: PAYMENT }] };
    expect(await actions.withdrawReport({ paymentId: PAYMENT, reason: "Ошибся" })).toEqual({ status: "done" });
    expect(db.calls).toEqual([["payments", "update", { status: "voided", void_reason: "Ошибся" }, "eq", "id", PAYMENT, "eq", "status", "reported", "select", "id"]]);
  });

  it("reads a confirmed report as stale and an error as failed", async () => {
    db.answers.payments = [{ data: [] }, { error: UNKNOWN }];
    expect(await actions.withdrawReport({ paymentId: PAYMENT, reason: "x" })).toEqual({ status: "stale" });
    expect(await actions.withdrawReport({ paymentId: PAYMENT, reason: "x" })).toEqual({ status: "failed" });
    expect(await actions.withdrawReport({ paymentId: "p", reason: "x" })).toEqual({ status: "invalid", fields: ["paymentId"] });
  });
});

describe("waiveCharge", () => {
  it("waives a charge with or without a reason", async () => {
    expect(await actions.waiveCharge({ chargeId: CHARGE, reason: "  " })).toEqual({ status: "done" });
    expect(await actions.waiveCharge({ chargeId: CHARGE, reason: " Болел " })).toEqual({ status: "done" });
    expect(rpcs()).toEqual([
      ["rpc", "waive_charge", { p_charge_id: CHARGE }],
      ["rpc", "waive_charge", { p_charge_id: CHARGE, p_reason: "Болел" }],
    ]);
    expect(next.refresh).toHaveBeenCalledTimes(2);
  });

  it("maps a waived charge, a gone charge and other errors", async () => {
    db.answers["rpc:waive_charge"] = [
      { error: { message: "already_waived", code: "P0001" } },
      { error: { message: "charge_not_found", code: "P0001" } },
      { error: UNKNOWN },
    ];
    expect(await actions.waiveCharge({ chargeId: CHARGE, reason: "" })).toEqual({ status: "refused", reason: "waived" });
    expect(await actions.waiveCharge({ chargeId: CHARGE, reason: "" })).toEqual({ status: "stale" });
    expect(await actions.waiveCharge({ chargeId: CHARGE, reason: "" })).toEqual({ status: "failed" });
  });

  it("refuses a malformed charge id without a call", async () => {
    expect(await actions.waiveCharge({ chargeId: "charge-1", reason: "" })).toEqual({ status: "invalid", fields: ["chargeId"] });
    expect(db.calls).toEqual([]);
  });
});

describe("adjustPass", () => {
  it("adds or takes sessions with a note", async () => {
    expect(await actions.adjustPass({ passId: PASS, delta: -200, note: " Перенос " })).toEqual({ status: "done" });
    expect(rpcs()).toEqual([["rpc", "adjust_pass", { p_pass_id: PASS, p_delta: -200, p_note: "Перенос" }]]);
  });

  it("refuses zero, more than 200 either way, a fraction and no note", async () => {
    for (const delta of [0, 201, -201, 1.5]) {
      expect(await actions.adjustPass({ passId: PASS, delta, note: "x" })).toEqual({ status: "invalid", fields: ["delta"] });
    }
    expect(await actions.adjustPass({ passId: PASS, delta: 1, note: "" })).toEqual({ status: "invalid", fields: ["note"] });
    expect(db.calls).toEqual([]);
  });

  it("maps an overdrawn pass, a gone pass and other errors", async () => {
    db.answers["rpc:adjust_pass"] = [
      { error: { message: "pass_overdrawn", code: "P0001" } },
      { error: { message: "pass_not_found", code: "P0001" } },
      { error: UNKNOWN },
    ];
    expect(await actions.adjustPass({ passId: PASS, delta: -1, note: "x" })).toEqual({ status: "refused", reason: "overdrawn" });
    expect(await actions.adjustPass({ passId: PASS, delta: -1, note: "x" })).toEqual({ status: "stale" });
    expect(await actions.adjustPass({ passId: PASS, delta: -1, note: "x" })).toEqual({ status: "failed" });
  });
});

describe("recordPastSession", () => {
  const input = { coachingId: PAIR, day: "2026-10-10", time: "18:30", durationMin: 60, status: "attended" as const };

  it("records an offline session at the trainer's wall time", async () => {
    expect(await actions.recordPastSession(input)).toEqual({ status: "done" });
    expect(rpcs()).toEqual([
      ["rpc", "record_past_session", { p_coaching_id: PAIR, p_starts_at: "2026-10-10T15:30:00.000Z", p_duration_min: 60, p_mode: "offline", p_status: "attended" }],
    ]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("uses the trainer's own zone", async () => {
    db.answers.profiles = { data: { time_zone: "Asia/Almaty" } };
    await actions.recordPastSession({ ...input, status: "no_show" });
    expect(rpcs()[0]?.[2]).toMatchObject({ p_starts_at: "2026-10-10T13:30:00.000Z", p_status: "no_show" });
  });

  it("refuses a bad time, duration or status without a call", async () => {
    expect(await actions.recordPastSession({ ...input, time: "24:00", durationMin: 14, status: "cancelled" as never })).toEqual({
      status: "invalid",
      fields: ["time", "durationMin", "status"],
    });
    expect(await actions.recordPastSession({ ...input, durationMin: 481 })).toEqual({ status: "invalid", fields: ["durationMin"] });
    expect(db.calls).toEqual([]);
    expect(await actions.recordPastSession({ ...input, durationMin: 15 })).toEqual({ status: "done" });
    expect(await actions.recordPastSession({ ...input, durationMin: 480 })).toEqual({ status: "done" });
  });

  it("needs a session", async () => {
    db.userId = null;
    expect(await actions.recordPastSession(input)).toEqual({ status: "failed" });
    expect(rpcs()).toEqual([]);
  });

  it("maps a future or too old time, someone else's client and other errors", async () => {
    db.answers["rpc:record_past_session"] = [
      { error: { message: "not_past", code: "P0001" } },
      { error: { message: "too_old", code: "P0001" } },
      { error: { message: "not_your_client", code: "P0001" } },
      { error: UNKNOWN },
    ];
    expect(await actions.recordPastSession(input)).toEqual({ status: "refused", reason: "not-past" });
    expect(await actions.recordPastSession(input)).toEqual({ status: "refused", reason: "not-past" });
    expect(await actions.recordPastSession(input)).toEqual({ status: "refused", reason: "ended" });
    expect(await actions.recordPastSession(input)).toEqual({ status: "failed" });
  });
});
