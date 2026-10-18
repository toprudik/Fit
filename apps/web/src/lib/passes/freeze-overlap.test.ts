import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Answer = { data?: unknown; error?: { message: string; code: string } | null; count?: number | null };

/** Every query made as the signed-in user, step by step, and what each table answers (an array: one per call). */
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
    for (const step of ["select", "eq", "in", "gt", "gte", "lt", "maybeSingle"]) {
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

const { freezeOverlap } = await import("./freeze-overlap");

const PASS = "00000000-0000-4000-8000-000000000001";
const PAIR = "00000000-0000-4000-8000-000000000002";
const NOW = "2026-10-18T09:00:00.000Z";

beforeAll(() => {
  vi.useFakeTimers({ now: new Date(NOW), toFake: ["Date"] });
});
afterAll(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  Object.assign(db, { userId: "trainer-1", calls: [], answers: {} });
});

describe("freezeOverlap", () => {
  it("counts the pair's confirmed sessions ahead on the frozen local days", async () => {
    db.answers.passes = { data: { coaching_id: PAIR } };
    db.answers.profiles = { data: { time_zone: "Asia/Yekaterinburg" } };
    db.answers.bookings = { data: [{ session_id: "s-1" }, { session_id: "s-2" }] };
    db.answers.sessions = { count: 2 };
    expect(await freezeOverlap({ passId: PASS, from: "2026-10-20", to: "2026-10-22" })).toBe(2);
    expect(db.calls).toEqual([
      ["passes", "select", "coaching_id", "eq", "id", PASS, "maybeSingle"],
      ["profiles", "select", "time_zone", "eq", "id", "trainer-1", "maybeSingle"],
      ["bookings", "select", "session_id", "eq", "coaching_id", PAIR, "eq", "status", "confirmed"],
      [
        "sessions",
        "select",
        "id",
        { count: "exact", head: true },
        "in",
        "id",
        ["s-1", "s-2"],
        // From local midnight of the first day to local midnight after the last (UTC+5), and never in the past.
        "gte",
        "starts_at",
        "2026-10-19T19:00:00.000Z",
        "gt",
        "starts_at",
        NOW,
        "lt",
        "starts_at",
        "2026-10-22T19:00:00.000Z",
      ],
    ]);
  });

  it("uses Moscow when the trainer has no zone", async () => {
    db.answers.passes = { data: { coaching_id: PAIR } };
    db.answers.bookings = { data: [{ session_id: "s-1" }] };
    db.answers.sessions = { count: 1 };
    expect(await freezeOverlap({ passId: PASS, from: "2026-10-20", to: "2026-10-20" })).toBe(1);
    expect(db.calls[3]).toContain("2026-10-19T21:00:00.000Z");
  });

  it("answers 0 for bad input without a query", async () => {
    expect(await freezeOverlap({ passId: "pass-1", from: "2026-10-20", to: "2026-10-22" })).toBe(0);
    expect(await freezeOverlap({ passId: PASS, from: "2026-10-22", to: "2026-10-20" })).toBe(0);
    expect(await freezeOverlap({ passId: PASS, from: "20.10.2026", to: "2026-10-22" })).toBe(0);
    expect(db.calls).toEqual([]);
  });

  it("answers 0 for a pass it cannot read or without a session", async () => {
    expect(await freezeOverlap({ passId: PASS, from: "2026-10-20", to: "2026-10-22" })).toBe(0);
    db.userId = null;
    db.answers.passes = { data: { coaching_id: PAIR } };
    expect(await freezeOverlap({ passId: PASS, from: "2026-10-20", to: "2026-10-22" })).toBe(0);
    expect(db.calls.some((call) => call[0] === "bookings")).toBe(false);
  });

  it("answers 0 when there are no bookings or they fail to load", async () => {
    db.answers.passes = { data: { coaching_id: PAIR } };
    db.answers.bookings = [{ data: [] }, { error: { message: "boom", code: "XX000" } }];
    expect(await freezeOverlap({ passId: PASS, from: "2026-10-20", to: "2026-10-22" })).toBe(0);
    db.answers.passes = { data: { coaching_id: PAIR } };
    expect(await freezeOverlap({ passId: PASS, from: "2026-10-20", to: "2026-10-22" })).toBe(0);
    expect(db.calls.some((call) => call[0] === "sessions")).toBe(false);
  });

  it("reads a missing count as 0", async () => {
    db.answers.passes = { data: { coaching_id: PAIR } };
    db.answers.bookings = { data: [{ session_id: "s-1" }] };
    db.answers.sessions = { count: null };
    expect(await freezeOverlap({ passId: PASS, from: "2026-10-20", to: "2026-10-22" })).toBe(0);
  });
});
