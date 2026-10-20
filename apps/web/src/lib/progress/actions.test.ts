import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const next = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/cache", () => ({ refresh: next.refresh }));

type Answer = { data?: unknown; error?: { message: string; code: string } | null };

/** Every query made as the signed-in user, step by step, and what each table answers (an array: one per call). */
const db = vi.hoisted(() => ({
  userId: "client-1" as string | null,
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
    for (const step of ["select", "insert", "update", "delete", "eq", "maybeSingle"]) {
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

const { addMeasurements, deleteMeasurement, updateMeasurement } = await import("./actions");

const PAIR = "00000000-0000-4000-8000-000000000001";
const ENTRY = "00000000-0000-4000-8000-000000000002";
const NOW = "2026-10-18T09:00:00.000Z";
const UNKNOWN = { message: "something internal broke", code: "XX000" };

const inserts = () => db.calls.filter((call) => call[1] === "insert");

beforeAll(() => {
  vi.useFakeTimers({ now: new Date(NOW), toFake: ["Date"] });
});
afterAll(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  Object.assign(db, { userId: "client-1", calls: [], answers: {} });
});

describe("addMeasurements", () => {
  it("enters the client's own values for today at the current instant", async () => {
    expect(
      await addMeasurements({
        date: "2026-10-18",
        values: [
          { kind: "weight", value: 72.35 },
          { kind: "waist", value: 80 },
        ],
      }),
    ).toEqual({ ok: true });
    expect(db.calls[0]).toEqual(["user_settings", "select", "time_zone", "eq", "user_id", "client-1", "maybeSingle"]);
    expect(inserts()).toEqual([
      [
        "measurements",
        "insert",
        [
          { client_id: "client-1", kind: "weight", value: 72.35, measured_at: NOW, local_date: "2026-10-18" },
          { client_id: "client-1", kind: "waist", value: 80, measured_at: NOW, local_date: "2026-10-18" },
        ],
      ],
    ]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("dates an earlier day at local noon in the user's zone", async () => {
    db.answers.user_settings = { data: { time_zone: "Asia/Yekaterinburg" } };
    await addMeasurements({ date: "2026-10-01", values: [{ kind: "weight", value: 70 }] });
    expect(inserts()[0]?.[2]).toEqual([{ client_id: "client-1", kind: "weight", value: 70, measured_at: "2026-10-01T07:00:00.000Z", local_date: "2026-10-01" }]);
  });

  it("lets the pair's trainer enter values for the client", async () => {
    db.userId = "trainer-1";
    db.answers.coachings = { data: { client_id: "client-1", trainer_id: "trainer-1" } };
    expect(await addMeasurements({ coachingId: PAIR, date: "2026-10-18", values: [{ kind: "hips", value: 98.5 }] })).toEqual({ ok: true });
    expect(db.calls).toContainEqual(["coachings", "select", "client_id, trainer_id", "eq", "id", PAIR, "maybeSingle"]);
    expect(inserts()[0]?.[2]).toEqual([{ client_id: "client-1", kind: "hips", value: 98.5, measured_at: NOW, local_date: "2026-10-18" }]);
  });

  it("writes nothing for a pair the caller does not train, or that is not readable", async () => {
    db.userId = "trainer-2";
    db.answers.coachings = [{ data: { client_id: "client-1", trainer_id: "trainer-1" } }, { data: null }, { error: UNKNOWN }];
    const input = { coachingId: PAIR, date: "2026-10-18", values: [{ kind: "weight" as const, value: 70 }] };
    expect(await addMeasurements(input)).toEqual({ ok: false, reason: "invalid" });
    expect(await addMeasurements(input)).toEqual({ ok: false, reason: "invalid" });
    expect(await addMeasurements(input)).toEqual({ ok: false, reason: "failed" });
    expect(inserts()).toEqual([]);
  });

  it.each([
    ["no values", []],
    ["ten values", Array.from({ length: 10 }, () => ({ kind: "weight", value: 70 }))],
    ["the same kind twice", [{ kind: "weight", value: 70 }, { kind: "weight", value: 71 }]],
    ["an unknown kind", [{ kind: "height", value: 180 }]],
    ["zero", [{ kind: "weight", value: 0 }]],
    ["over the limit", [{ kind: "weight", value: 500.01 }]],
    ["three decimals", [{ kind: "weight", value: 70.123 }]],
    ["a string", [{ kind: "weight", value: "70" }]],
    ["not an object", [null]],
  ])("refuses %s without a query", async (_, values) => {
    expect(await addMeasurements({ date: "2026-10-18", values: values as never })).toEqual({ ok: false, reason: "invalid" });
    expect(db.calls).toEqual([]);
  });

  it("takes nine kinds at their upper limits", async () => {
    const values = [
      { kind: "weight", value: 500 },
      { kind: "neck", value: 100 },
      { kind: "chest", value: 300 },
      { kind: "waist", value: 300 },
      { kind: "abdomen", value: 300 },
      { kind: "hips", value: 300 },
      { kind: "thigh", value: 200 },
      { kind: "upper_arm", value: 150 },
      { kind: "calf", value: 150 },
    ] as const;
    expect(await addMeasurements({ date: "2026-10-18", values: [...values] })).toEqual({ ok: true });
  });

  it("refuses a bad date or pair id without a query", async () => {
    const values = [{ kind: "weight" as const, value: 70 }];
    expect(await addMeasurements({ date: "2026-02-30", values })).toEqual({ ok: false, reason: "invalid" });
    expect(await addMeasurements({ date: "18.10.2026", values })).toEqual({ ok: false, reason: "invalid" });
    expect(await addMeasurements({ coachingId: "pair-1", date: "2026-10-18", values })).toEqual({ ok: false, reason: "invalid" });
    expect(db.calls).toEqual([]);
  });

  it("refuses a day after today in the user's zone, or before 1900", async () => {
    const values = [{ kind: "weight" as const, value: 70 }];
    expect(await addMeasurements({ date: "2026-10-19", values })).toEqual({ ok: false, reason: "invalid" });
    expect(await addMeasurements({ date: "1899-12-31", values })).toEqual({ ok: false, reason: "invalid" });
    expect(inserts()).toEqual([]);
    // Still the 17th in Honolulu (UTC-10) at 09:00 UTC.
    db.answers.user_settings = { data: { time_zone: "Pacific/Honolulu" } };
    expect(await addMeasurements({ date: "2026-10-18", values })).toEqual({ ok: false, reason: "invalid" });
    expect(inserts()).toEqual([]);
  });

  it("needs a session", async () => {
    db.userId = null;
    expect(await addMeasurements({ date: "2026-10-18", values: [{ kind: "weight", value: 70 }] })).toEqual({ ok: false, reason: "invalid" });
    expect(db.calls).toEqual([]);
  });

  it("reads a refused insert as invalid and anything else as failed", async () => {
    db.answers.measurements = [{ error: { message: "new row violates row-level security policy", code: "42501" } }, { error: UNKNOWN }];
    const input = { date: "2026-10-18", values: [{ kind: "weight" as const, value: 70 }] };
    expect(await addMeasurements(input)).toEqual({ ok: false, reason: "invalid" });
    expect(await addMeasurements(input)).toEqual({ ok: false, reason: "failed" });
    expect(next.refresh).not.toHaveBeenCalled();
  });
});

describe("updateMeasurement", () => {
  it("changes the value of one entry", async () => {
    db.answers.measurements = { data: [{ id: ENTRY }] };
    expect(await updateMeasurement({ id: ENTRY, kind: "weight", value: 71.5 })).toEqual({ ok: true });
    expect(db.calls).toEqual([["measurements", "update", { value: 71.5 }, "eq", "id", ENTRY, "select", "id"]]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("refuses a bad id, kind or value without a query", async () => {
    expect(await updateMeasurement({ id: "entry-1", kind: "weight", value: 70 })).toEqual({ ok: false, reason: "invalid" });
    expect(await updateMeasurement({ id: ENTRY, kind: "height" as never, value: 70 })).toEqual({ ok: false, reason: "invalid" });
    expect(await updateMeasurement({ id: ENTRY, kind: "neck", value: 100.01 })).toEqual({ ok: false, reason: "invalid" });
    expect(await updateMeasurement({ id: ENTRY, kind: "neck", value: -1 })).toEqual({ ok: false, reason: "invalid" });
    expect(db.calls).toEqual([]);
  });

  it("reads someone else's entry as invalid and an error as failed", async () => {
    db.answers.measurements = [{ data: [] }, { error: UNKNOWN }];
    expect(await updateMeasurement({ id: ENTRY, kind: "weight", value: 70 })).toEqual({ ok: false, reason: "invalid" });
    expect(await updateMeasurement({ id: ENTRY, kind: "weight", value: 70 })).toEqual({ ok: false, reason: "failed" });
    expect(next.refresh).not.toHaveBeenCalled();
  });
});

describe("deleteMeasurement", () => {
  it("deletes one entry", async () => {
    db.answers.measurements = { data: [{ id: ENTRY }] };
    expect(await deleteMeasurement(ENTRY)).toEqual({ ok: true });
    expect(db.calls).toEqual([["measurements", "delete", "eq", "id", ENTRY, "select", "id"]]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("refuses a bad id, reads no row as invalid and an error as failed", async () => {
    expect(await deleteMeasurement("1; drop table")).toEqual({ ok: false, reason: "invalid" });
    expect(db.calls).toEqual([]);
    db.answers.measurements = [{ data: [] }, { error: UNKNOWN }];
    expect(await deleteMeasurement(ENTRY)).toEqual({ ok: false, reason: "invalid" });
    expect(await deleteMeasurement(ENTRY)).toEqual({ ok: false, reason: "failed" });
  });
});
