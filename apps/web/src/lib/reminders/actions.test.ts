import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const next = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/cache", () => ({ refresh: next.refresh }));

type Answer = { data?: unknown; error?: { message: string; code: string } | null };

/** Every query made as the signed-in user, step by step, and what each table answers (an array: one per call). */
const db = vi.hoisted(() => ({
  userId: "user-1" as string | null,
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
    for (const step of ["select", "insert", "update", "delete", "eq"]) {
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

const { setDefaultReminders, setDigestTime, setNotificationEnabled, setPairReminders, setQuietHours } = await import("./actions");

const PAIR = "00000000-0000-4000-8000-000000000001";
const UNKNOWN = { message: "something internal broke", code: "XX000" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  Object.assign(db, { userId: "user-1", calls: [], answers: {} });
});

describe("setPairReminders", () => {
  it("saves the client's offsets for the pair, largest first", async () => {
    db.answers.coachings = { data: [{ id: PAIR }] };
    expect(await setPairReminders({ coachingId: PAIR, offsets: [60, 1440, 5] })).toEqual({ ok: true });
    expect(db.calls).toEqual([["coachings", "update", { client_reminder_offsets: [1440, 60, 5] }, "eq", "id", PAIR, "eq", "client_id", "user-1", "select", "id"]]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("turns all reminders off with no offsets and takes 7 days", async () => {
    db.answers.coachings = { data: [{ id: PAIR }] };
    expect(await setPairReminders({ coachingId: PAIR, offsets: [] })).toEqual({ ok: true });
    db.answers.coachings = { data: [{ id: PAIR }] };
    expect(await setPairReminders({ coachingId: PAIR, offsets: [10080] })).toEqual({ ok: true });
  });

  it.each([
    ["four reminders", [15, 60, 180, 1440]],
    ["a duplicate", [60, 60]],
    ["under 5 minutes", [4]],
    ["over 7 days", [10081]],
    ["a fraction", [15.5]],
  ])("refuses %s without a query", async (_, offsets) => {
    expect(await setPairReminders({ coachingId: PAIR, offsets })).toEqual({ ok: false });
    expect(db.calls).toEqual([]);
  });

  it("refuses a bad pair id and no session", async () => {
    expect(await setPairReminders({ coachingId: "pair-1", offsets: [60] })).toEqual({ ok: false });
    db.userId = null;
    expect(await setPairReminders({ coachingId: PAIR, offsets: [60] })).toEqual({ ok: false });
    expect(db.calls).toEqual([]);
  });

  it("reads someone else's pair (no row) and an error as not saved", async () => {
    db.answers.coachings = [{ data: [] }, { error: UNKNOWN }];
    expect(await setPairReminders({ coachingId: PAIR, offsets: [60] })).toEqual({ ok: false });
    expect(await setPairReminders({ coachingId: PAIR, offsets: [60] })).toEqual({ ok: false });
    expect(next.refresh).not.toHaveBeenCalled();
  });
});

describe("setDefaultReminders", () => {
  it("saves the trainer's defaults for new clients", async () => {
    db.answers.trainer_profiles = { data: [{ user_id: "user-1" }] };
    expect(await setDefaultReminders([15, 180])).toEqual({ ok: true });
    expect(db.calls).toEqual([["trainer_profiles", "update", { default_client_reminder_offsets: [180, 15] }, "eq", "user_id", "user-1", "select", "user_id"]]);
  });

  it("refuses bad offsets or no session without a query, and a non-trainer as not saved", async () => {
    expect(await setDefaultReminders([1])).toEqual({ ok: false });
    db.userId = null;
    expect(await setDefaultReminders([60])).toEqual({ ok: false });
    expect(db.calls).toEqual([]);
    db.userId = "client-1";
    db.answers.trainer_profiles = { data: [] };
    expect(await setDefaultReminders([60])).toEqual({ ok: false });
  });
});

describe("setQuietHours", () => {
  it("saves hours as HH:MM, seconds dropped", async () => {
    db.answers.user_settings = { data: [{ user_id: "user-1" }] };
    expect(await setQuietHours({ start: "22:00:00", end: "07:30" })).toEqual({ ok: true });
    expect(db.calls).toEqual([["user_settings", "update", { quiet_hours_start: "22:00", quiet_hours_end: "07:30" }, "eq", "user_id", "user-1", "select", "user_id"]]);
  });

  it("turns quiet hours off with null", async () => {
    db.answers.user_settings = { data: [{ user_id: "user-1" }] };
    expect(await setQuietHours(null)).toEqual({ ok: true });
    expect(db.calls[0]?.[2]).toEqual({ quiet_hours_start: null, quiet_hours_end: null });
  });

  it("refuses a bad or empty window without a query", async () => {
    expect(await setQuietHours({ start: "24:00", end: "07:00" })).toEqual({ ok: false });
    expect(await setQuietHours({ start: "22:00", end: "7:00" })).toEqual({ ok: false });
    expect(await setQuietHours({ start: "22:00", end: "22:00:00" })).toEqual({ ok: false });
    expect(db.calls).toEqual([]);
  });

  it("needs a session and reports an error", async () => {
    db.userId = null;
    expect(await setQuietHours(null)).toEqual({ ok: false });
    expect(db.calls).toEqual([]);
    db.userId = "user-1";
    db.answers.user_settings = { error: UNKNOWN };
    expect(await setQuietHours(null)).toEqual({ ok: false });
  });
});

describe("setDigestTime", () => {
  it("saves the time of the daily digest", async () => {
    db.answers.user_settings = { data: [{ user_id: "user-1" }] };
    expect(await setDigestTime("08:15:00")).toEqual({ ok: true });
    expect(db.calls).toEqual([["user_settings", "update", { daily_digest_time: "08:15" }, "eq", "user_id", "user-1", "select", "user_id"]]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("refuses a bad time or no session without a query, and reports no row", async () => {
    expect(await setDigestTime("8:15")).toEqual({ ok: false });
    expect(await setDigestTime("23:60")).toEqual({ ok: false });
    db.userId = null;
    expect(await setDigestTime("08:00")).toEqual({ ok: false });
    expect(db.calls).toEqual([]);
    db.userId = "user-1";
    db.answers.user_settings = { data: [] };
    expect(await setDigestTime("08:00")).toEqual({ ok: false });
  });
});

describe("setNotificationEnabled", () => {
  it("turns a default-on type off with a row, and on again by deleting it", async () => {
    expect(await setNotificationEnabled({ type: "session_reminder", enabled: false })).toEqual({ ok: true });
    expect(await setNotificationEnabled({ type: "session_reminder", enabled: true })).toEqual({ ok: true });
    expect(db.calls).toEqual([
      ["notification_preferences", "insert", { user_id: "user-1", type: "session_reminder", enabled: false }],
      ["notification_preferences", "delete", "eq", "user_id", "user-1", "eq", "type", "session_reminder"],
    ]);
    expect(next.refresh).toHaveBeenCalledTimes(2);
  });

  it("turns the default-off type on with a row, and off again by deleting it", async () => {
    expect(await setNotificationEnabled({ type: "homework_done", enabled: true })).toEqual({ ok: true });
    expect(await setNotificationEnabled({ type: "homework_done", enabled: false })).toEqual({ ok: true });
    expect(db.calls).toEqual([
      ["notification_preferences", "insert", { user_id: "user-1", type: "homework_done", enabled: true }],
      ["notification_preferences", "delete", "eq", "user_id", "user-1", "eq", "type", "homework_done"],
    ]);
  });

  it("reads a row that is already there as done", async () => {
    db.answers.notification_preferences = { error: { message: "duplicate key value", code: "23505" } };
    expect(await setNotificationEnabled({ type: "debt", enabled: false })).toEqual({ ok: true });
    db.answers.notification_preferences = { error: { message: "duplicate key value", code: "23505" } };
    expect(await setNotificationEnabled({ type: "homework_done", enabled: true })).toEqual({ ok: true });
  });

  it("reports other errors on either write", async () => {
    db.answers.notification_preferences = { error: UNKNOWN };
    expect(await setNotificationEnabled({ type: "debt", enabled: false })).toEqual({ ok: false });
    db.answers.notification_preferences = { error: UNKNOWN };
    expect(await setNotificationEnabled({ type: "debt", enabled: true })).toEqual({ ok: false });
    db.answers.notification_preferences = { error: UNKNOWN };
    expect(await setNotificationEnabled({ type: "homework_done", enabled: true })).toEqual({ ok: false });
    expect(next.refresh).not.toHaveBeenCalled();
  });

  it("refuses an unknown type or no session without a query", async () => {
    expect(await setNotificationEnabled({ type: "marketing", enabled: false })).toEqual({ ok: false });
    db.userId = null;
    expect(await setNotificationEnabled({ type: "debt", enabled: false })).toEqual({ ok: false });
    expect(db.calls).toEqual([]);
  });
});
