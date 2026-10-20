import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const next = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/cache", () => ({ refresh: next.refresh }));

type Answer = { data?: unknown; error?: { message: string; code: string } | null };

/** Every query and RPC made as the signed-in user, and what they answer: keyed by table or "rpc:<name>". */
const db = vi.hoisted(() => ({
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
    for (const step of ["select", "update", "eq"]) {
      chain[step] = (...args: unknown[]) => {
        steps.push(step, ...args);
        return chain;
      };
    }
    return chain;
  };
  return {
    createSupabaseServerClient: async () => ({
      from: (table: string) => query(table, [table]),
      rpc: (fn: string, args: unknown) => query(`rpc:${fn}`, ["rpc", fn, args]),
    }),
  };
});

const { closeDays, reopenDays, saveWeekTemplate, setSlotOpen } = await import("./actions");

const LOCATION = "00000000-0000-4000-8000-000000000001";
const SLOT = "00000000-0000-4000-8000-000000000002";
const SESSION = "00000000-0000-4000-8000-000000000003";
const UNKNOWN = { message: "something internal broke", code: "XX000" };

const offline = { isoWeekday: 1, start: "09:00", end: "12:00", durationMin: 60, mode: "offline" as const, locationId: LOCATION, meetingUrl: null };
const online = { isoWeekday: 7, start: "18:00", end: "21:00", durationMin: 45, mode: "online" as const, locationId: null, meetingUrl: " https://meet.example.test/a " };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  Object.assign(db, { calls: [], answers: {} });
});

describe("saveWeekTemplate", () => {
  it("sends the whole week in database shape and returns the generated slots", async () => {
    db.answers["rpc:save_week_template"] = { data: 24 };
    expect(await saveWeekTemplate({ windows: [offline, online], horizonWeeks: 4, bufferMin: 15 })).toEqual({ status: "done", slots: 24 });
    expect(db.calls).toEqual([
      [
        "rpc",
        "save_week_template",
        {
          p_items: [
            { iso_weekday: 1, start_time: "09:00", end_time: "12:00", duration_min: 60, mode: "offline", location_id: LOCATION, meeting_url: null },
            { iso_weekday: 7, start_time: "18:00", end_time: "21:00", duration_min: 45, mode: "online", location_id: null, meeting_url: "https://meet.example.test/a" },
          ],
          p_horizon_weeks: 4,
          p_buffer_min: 15,
        },
      ],
    ]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("clears the week with no windows and sends an empty link as null", async () => {
    db.answers["rpc:save_week_template"] = [{ data: 0 }, { data: 3 }];
    expect(await saveWeekTemplate({ windows: [], horizonWeeks: 1, bufferMin: 0 })).toEqual({ status: "done", slots: 0 });
    await saveWeekTemplate({ windows: [{ ...online, meetingUrl: "   " }], horizonWeeks: 12, bufferMin: 30 });
    expect((db.calls[1]?.[2] as { p_items: { meeting_url: unknown }[] }).p_items[0]?.meeting_url).toBeNull();
  });

  it.each([
    ["weekday 0", { ...offline, isoWeekday: 0 }],
    ["weekday 8", { ...offline, isoWeekday: 8 }],
    ["a start of 24:00", { ...offline, start: "24:00" }],
    ["an end without a leading zero", { ...offline, end: "9:30" }],
    ["a duration not offered", { ...offline, durationMin: 50 }],
    ["an unknown mode", { ...offline, mode: "hybrid" }],
    ["a malformed place", { ...offline, locationId: "gym-1" }],
    ["a link on an offline window", { ...offline, meetingUrl: "https://meet.example.test/a" }],
    ["a place on an online window", { ...online, locationId: LOCATION }],
    ["a link over 500 characters", { ...online, meetingUrl: `https://${"x".repeat(500)}` }],
  ])("refuses %s without a call", async (_, window) => {
    expect(await saveWeekTemplate({ windows: [window as never], horizonWeeks: 4, bufferMin: 15 })).toEqual({ status: "invalid" });
    expect(db.calls).toEqual([]);
  });

  it("refuses a horizon or buffer not offered, and more than 100 windows", async () => {
    expect(await saveWeekTemplate({ windows: [], horizonWeeks: 5, bufferMin: 15 })).toEqual({ status: "invalid" });
    expect(await saveWeekTemplate({ windows: [], horizonWeeks: 4, bufferMin: 5 })).toEqual({ status: "invalid" });
    expect(await saveWeekTemplate({ windows: Array.from({ length: 101 }, () => offline), horizonWeeks: 4, bufferMin: 15 })).toEqual({ status: "invalid" });
    expect(db.calls).toEqual([]);
  });

  it("maps overlapping windows, a window check and other errors", async () => {
    db.answers["rpc:save_week_template"] = [
      { error: { message: "items_overlap", code: "P0001" } },
      { error: { message: "check violation", code: "23514" } },
      { error: { message: "bad value", code: "22023" } },
      { error: { message: "bad time", code: "22007" } },
      { error: UNKNOWN },
    ];
    const input = { windows: [offline], horizonWeeks: 4, bufferMin: 15 };
    expect(await saveWeekTemplate(input)).toEqual({ status: "overlap" });
    expect(await saveWeekTemplate(input)).toEqual({ status: "invalid" });
    expect(await saveWeekTemplate(input)).toEqual({ status: "invalid" });
    expect(await saveWeekTemplate(input)).toEqual({ status: "invalid" });
    expect(await saveWeekTemplate(input)).toEqual({ status: "failed" });
    expect(next.refresh).not.toHaveBeenCalled();
  });
});

describe("closeDays", () => {
  it("closes the days and returns the sessions left there", async () => {
    db.answers["rpc:close_schedule_days"] = { data: [{ session_id: SESSION, starts_at: "2026-11-02T06:00:00Z", title: null }] };
    expect(await closeDays({ from: "2026-11-02", to: "2026-11-08" })).toEqual({
      status: "done",
      sessions: [{ id: SESSION, startsAt: "2026-11-02T06:00:00Z", title: null }],
    });
    expect(db.calls).toEqual([["rpc", "close_schedule_days", { p_from: "2026-11-02", p_to: "2026-11-08" }]]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("refuses a malformed day without a call", async () => {
    expect(await closeDays({ from: "02.11.2026", to: "2026-11-08" })).toEqual({ status: "invalid" });
    expect(await closeDays({ from: "2026-11-02", to: "" })).toEqual({ status: "invalid" });
    expect(db.calls).toEqual([]);
  });

  it("maps a bad range and other errors", async () => {
    db.answers["rpc:close_schedule_days"] = [{ error: { message: "invalid_range", code: "P0001" } }, { error: UNKNOWN }];
    expect(await closeDays({ from: "2026-11-08", to: "2026-11-02" })).toEqual({ status: "invalid" });
    expect(await closeDays({ from: "2026-11-02", to: "2026-11-08" })).toEqual({ status: "failed" });
  });
});

describe("reopenDays", () => {
  it("fills the closed days back and refreshes", async () => {
    expect(await reopenDays({ slotId: SLOT })).toEqual({ status: "done" });
    expect(db.calls).toEqual([["rpc", "reopen_schedule", { p_slot_id: SLOT }]]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("reads days opened meanwhile as done and other errors as failed", async () => {
    db.answers["rpc:reopen_schedule"] = [{ error: { message: "not_closed", code: "P0001" } }, { error: UNKNOWN }];
    expect(await reopenDays({ slotId: SLOT })).toEqual({ status: "done" });
    expect(await reopenDays({ slotId: SLOT })).toEqual({ status: "failed" });
  });

  it("refuses a malformed slot without a call", async () => {
    expect(await reopenDays({ slotId: "slot-1" })).toEqual({ status: "failed" });
    expect(db.calls).toEqual([]);
  });
});

describe("setSlotOpen", () => {
  it("closes a slot and opens it again", async () => {
    db.answers.slots = { data: [{ id: SLOT }] };
    expect(await setSlotOpen({ slotId: SLOT, open: false })).toEqual({ status: "done" });
    db.answers.slots = { data: [{ id: SLOT }] };
    expect(await setSlotOpen({ slotId: SLOT, open: true })).toEqual({ status: "done" });
    expect(db.calls).toEqual([
      ["slots", "update", { status: "closed" }, "eq", "id", SLOT, "select", "id"],
      ["slots", "update", { status: "open" }, "eq", "id", SLOT, "select", "id"],
    ]);
  });

  it("reads a booked or foreign slot (no row) and an error as failed", async () => {
    db.answers.slots = [{ data: [] }, { error: UNKNOWN }];
    expect(await setSlotOpen({ slotId: SLOT, open: false })).toEqual({ status: "failed" });
    expect(await setSlotOpen({ slotId: SLOT, open: false })).toEqual({ status: "failed" });
    expect(next.refresh).not.toHaveBeenCalled();
  });

  it("refuses bad input without a query", async () => {
    expect(await setSlotOpen({ slotId: "slot-1", open: true })).toEqual({ status: "failed" });
    expect(await setSlotOpen({ slotId: SLOT, open: "yes" as never })).toEqual({ status: "failed" });
    expect(db.calls).toEqual([]);
  });
});
