import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const next = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/cache", () => ({ refresh: next.refresh }));

/** Client names of overlapping sessions, by pair. */
const names = vi.hoisted(() => ({ clientNames: vi.fn(async () => new Map([["pair-a", "Анна"]])) }));
vi.mock("./load", () => names);

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
    for (const step of ["select", "update", "eq", "maybeSingle"]) {
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
      rpc: (fn: string, args: unknown) => query(`rpc:${fn}`, ["rpc", fn, args]),
    }),
  };
});

const actions = await import("./session-actions");

const PAIR = "00000000-0000-4000-8000-000000000001";
const SESSION = "00000000-0000-4000-8000-000000000002";
const LOCATION = "00000000-0000-4000-8000-000000000003";
const BOOKING = "00000000-0000-4000-8000-000000000004";
const ENTRY = "00000000-0000-4000-8000-000000000005";
const UNKNOWN = { message: "something internal broke", code: "XX000" };

/** 10:00 on 2 November in Moscow (UTC+3), an hour long. */
const STARTS = "2026-11-02T07:00:00.000Z";
const ENDS = "2026-11-02T08:00:00.000Z";

const base = { day: "2026-11-02", time: "10:00", durationMin: 60, mode: "offline" as const, locationId: LOCATION, meetingUrl: null, title: null, force: false };
const personal = { ...base, coachingId: PAIR, repeat: null };
const group = { ...base, title: " Утренняя йога ", capacity: 8, openForBooking: true, repeat: null };
const edit = { ...base, sessionId: SESSION, following: false };

const rpcs = (fn?: string) => db.calls.filter((call) => call[0] === "rpc" && (!fn || call[1] === fn));
const KNOWN = [
  "in_past",
  "invalid_duration",
  "invalid_title",
  "invalid_repeat",
  "invalid_location",
  "invalid_link",
  "following_keeps_date",
  "not_your_client",
  "session_not_found",
  "not_editable",
  "invalid_capacity",
] as const;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  Object.assign(db, { userId: "trainer-1", calls: [], answers: {} });
  db.answers["rpc:session_conflicts"] = { data: [] };
});

describe("createSession", () => {
  it("checks for overlaps, then assigns one session at the trainer's wall time", async () => {
    db.answers["rpc:create_session"] = { data: [{ session_id: SESSION, created: 1 }] };
    expect(await actions.createSession(personal)).toEqual({ status: "done", sessionId: SESSION, count: 1 });
    expect(db.calls).toEqual([
      ["user_settings", "select", "time_zone", "eq", "user_id", "trainer-1", "maybeSingle"],
      ["rpc", "session_conflicts", { p_starts_at: STARTS, p_ends_at: ENDS }],
      ["rpc", "create_session", { p_coaching_id: PAIR, p_starts_at: STARTS, p_duration_min: 60, p_mode: "offline", p_location_id: LOCATION }],
    ]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("uses the trainer's own zone", async () => {
    db.answers.user_settings = { data: { time_zone: "Asia/Almaty" } };
    db.answers["rpc:create_session"] = { data: [{ session_id: SESSION, created: 1 }] };
    await actions.createSession({ ...personal, force: true });
    expect(rpcs("create_session")[0]?.[2]).toMatchObject({ p_starts_at: "2026-11-02T05:00:00.000Z" });
  });

  it("sends a weekly repeat, an online link and a title, and leaves out the place of an online session", async () => {
    db.answers["rpc:create_session"] = { data: [{ session_id: SESSION, created: 12 }] };
    const result = await actions.createSession({
      ...personal,
      mode: "online",
      meetingUrl: " https://meet.example.test/x ",
      title: " Растяжка ",
      repeat: { weekdays: [1, 3], until: "2026-12-31", count: 12 },
    });
    expect(result).toEqual({ status: "done", sessionId: SESSION, count: 12 });
    expect(rpcs("create_session")[0]?.[2]).toEqual({
      p_coaching_id: PAIR,
      p_starts_at: STARTS,
      p_duration_min: 60,
      p_mode: "online",
      p_meeting_url: "https://meet.example.test/x",
      p_title: "Растяжка",
      p_weekdays: [1, 3],
      p_until: "2026-12-31",
      p_count: 12,
    });
  });

  it("returns overlapping sessions with names instead of saving", async () => {
    db.answers["rpc:session_conflicts"] = {
      data: [
        { session_id: "s-1", starts_at: STARTS, ends_at: ENDS, coaching_id: "pair-a", title: null },
        { session_id: "s-2", starts_at: STARTS, ends_at: ENDS, coaching_id: null, title: "Группа" },
        { session_id: "s-3", starts_at: STARTS, ends_at: ENDS, coaching_id: null, title: null },
      ],
    };
    expect(await actions.createSession(personal)).toEqual({
      status: "conflict",
      conflicts: [
        { id: "s-1", startsAt: STARTS, endsAt: ENDS, name: "Анна" },
        { id: "s-2", startsAt: STARTS, endsAt: ENDS, name: "Группа" },
        { id: "s-3", startsAt: STARTS, endsAt: ENDS, name: "" },
      ],
    });
    expect(names.clientNames).toHaveBeenCalledWith(expect.anything(), ["pair-a"]);
    expect(rpcs("create_session")).toEqual([]);
    expect(next.refresh).not.toHaveBeenCalled();
  });

  it("saves over an overlap with force, without checking", async () => {
    db.answers["rpc:create_session"] = { data: [{ session_id: SESSION, created: 1 }] };
    expect(await actions.createSession({ ...personal, force: true })).toMatchObject({ status: "done" });
    expect(rpcs("session_conflicts")).toEqual([]);
  });

  it("saves when the overlap check itself fails", async () => {
    db.answers["rpc:session_conflicts"] = { error: UNKNOWN };
    db.answers["rpc:create_session"] = { data: [{ session_id: SESSION, created: 1 }] };
    expect(await actions.createSession(personal)).toMatchObject({ status: "done" });
  });

  it("makes the booking a single session when asked", async () => {
    db.answers["rpc:create_session"] = { data: [{ session_id: SESSION, created: 1 }] };
    db.answers.bookings = { data: { id: BOOKING } };
    expect(await actions.createSession({ ...personal, singleTitle: " Разовое " })).toEqual({ status: "done", sessionId: SESSION, count: 1 });
    expect(db.calls.slice(-2)).toEqual([
      ["bookings", "select", "id", "eq", "session_id", SESSION, "maybeSingle"],
      ["rpc", "make_booking_single", { p_booking_id: BOOKING, p_title: "Разовое" }],
    ]);
  });

  it("says when the session was assigned but not made single", async () => {
    db.answers["rpc:create_session"] = [{ data: [{ session_id: SESSION, created: 1 }] }, { data: [{ session_id: SESSION, created: 1 }] }];
    db.answers["rpc:make_booking_single"] = { error: UNKNOWN };
    db.answers.bookings = [{ data: { id: BOOKING } }, { data: null }];
    expect(await actions.createSession({ ...personal, singleTitle: "Разовое" })).toEqual({ status: "done", sessionId: SESSION, count: 1, singleFailed: true });
    expect(await actions.createSession({ ...personal, singleTitle: "Разовое" })).toEqual({ status: "done", sessionId: SESSION, count: 1, singleFailed: true });
    expect(next.refresh).toHaveBeenCalledTimes(2);
  });

  it("does not make a repeat single", async () => {
    db.answers["rpc:create_session"] = { data: [{ session_id: SESSION, created: 4 }] };
    await actions.createSession({ ...personal, singleTitle: "Разовое", repeat: { weekdays: [1], until: null, count: 4 } });
    expect(rpcs("make_booking_single")).toEqual([]);
    expect(db.calls.some((call) => call[0] === "bookings")).toBe(false);
  });

  it.each([
    ["a malformed pair", { coachingId: "pair-1" }],
    ["an impossible day", { day: "2026-02-30" }],
    ["a bad time", { time: "25:00" }],
    ["14 minutes", { durationMin: 14 }],
    ["481 minutes", { durationMin: 481 }],
    ["a title over 120 characters", { title: "x".repeat(121) }],
    ["an empty single title", { singleTitle: "  " }],
    ["a repeat without weekdays", { repeat: { weekdays: [], until: null, count: null } }],
    ["weekday 8", { repeat: { weekdays: [8], until: null, count: null } }],
    ["a repeat of one", { repeat: { weekdays: [1], until: null, count: 1 } }],
    ["a repeat of 201", { repeat: { weekdays: [1], until: null, count: 201 } }],
    ["force as a string", { force: "yes" }],
  ])("refuses %s without a call", async (_, change) => {
    expect(await actions.createSession({ ...personal, ...change } as never)).toEqual({ status: "error", error: "failed" });
    expect(db.calls).toEqual([]);
  });

  it("needs a session", async () => {
    db.userId = null;
    expect(await actions.createSession(personal)).toEqual({ status: "error", error: "failed" });
    expect(rpcs()).toEqual([]);
  });

  it.each(KNOWN)("names the database's %s", async (message) => {
    db.answers["rpc:create_session"] = { error: { message, code: "P0001" } };
    expect(await actions.createSession(personal)).toEqual({ status: "error", error: message });
    expect(next.refresh).not.toHaveBeenCalled();
  });

  it("reports any other error as failed", async () => {
    db.answers["rpc:create_session"] = { error: UNKNOWN };
    expect(await actions.createSession(personal)).toEqual({ status: "error", error: "failed" });
  });
});

describe("createGroupSession", () => {
  it("creates a titled group with seats, open for booking", async () => {
    db.answers["rpc:create_group_session"] = { data: [{ session_id: SESSION, created: 1 }] };
    expect(await actions.createGroupSession(group)).toEqual({ status: "done", sessionId: SESSION, count: 1 });
    expect(rpcs("create_group_session")).toEqual([
      [
        "rpc",
        "create_group_session",
        {
          p_starts_at: STARTS,
          p_duration_min: 60,
          p_capacity: 8,
          p_title: "Утренняя йога",
          p_mode: "offline",
          p_location_id: LOCATION,
          p_open_for_booking: true,
        },
      ],
    ]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("sends a repeat and an online link", async () => {
    db.answers["rpc:create_group_session"] = { data: [{ session_id: SESSION, created: 8 }] };
    await actions.createGroupSession({
      ...group,
      mode: "online",
      locationId: LOCATION,
      meetingUrl: "https://meet.example.test/g",
      openForBooking: false,
      repeat: { weekdays: [2], until: null, count: 8 },
    });
    expect(rpcs("create_group_session")[0]?.[2]).toEqual({
      p_starts_at: STARTS,
      p_duration_min: 60,
      p_capacity: 8,
      p_title: "Утренняя йога",
      p_mode: "online",
      p_meeting_url: "https://meet.example.test/g",
      p_open_for_booking: false,
      p_weekdays: [2],
      p_count: 8,
    });
  });

  it("returns overlaps instead of saving unless forced", async () => {
    db.answers["rpc:session_conflicts"] = { data: [{ session_id: "s-1", starts_at: STARTS, ends_at: ENDS, coaching_id: null, title: "Пилатес" }] };
    expect(await actions.createGroupSession(group)).toMatchObject({ status: "conflict", conflicts: [{ id: "s-1", name: "Пилатес" }] });
    expect(rpcs("create_group_session")).toEqual([]);
  });

  it("asks for a title when it is missing, and fails other bad input, without a call", async () => {
    expect(await actions.createGroupSession({ ...group, title: "   " })).toEqual({ status: "error", error: "invalid_title" });
    expect(await actions.createGroupSession({ ...group, capacity: 1 })).toEqual({ status: "error", error: "failed" });
    expect(await actions.createGroupSession({ ...group, capacity: 101 })).toEqual({ status: "error", error: "failed" });
    expect(await actions.createGroupSession({ ...group, title: "x".repeat(121) })).toEqual({ status: "error", error: "failed" });
    expect(db.calls).toEqual([]);
  });

  it("takes 2 and 100 seats", async () => {
    db.answers["rpc:create_group_session"] = [{ data: [{ session_id: SESSION, created: 1 }] }, { data: [{ session_id: SESSION, created: 1 }] }];
    expect(await actions.createGroupSession({ ...group, capacity: 2 })).toMatchObject({ status: "done" });
    expect(await actions.createGroupSession({ ...group, capacity: 100 })).toMatchObject({ status: "done" });
  });

  it("needs a session and maps errors", async () => {
    db.userId = null;
    expect(await actions.createGroupSession(group)).toEqual({ status: "error", error: "failed" });
    db.userId = "trainer-1";
    db.answers["rpc:create_group_session"] = [{ error: { message: "invalid_capacity", code: "P0001" } }, { error: UNKNOWN }];
    expect(await actions.createGroupSession(group)).toEqual({ status: "error", error: "invalid_capacity" });
    expect(await actions.createGroupSession(group)).toEqual({ status: "error", error: "failed" });
  });
});

describe("updateSession", () => {
  it("checks overlaps ignoring the session itself, then moves it", async () => {
    db.answers["rpc:update_session"] = { data: 1 };
    expect(await actions.updateSession({ ...edit, title: " Новое " })).toEqual({ status: "done", sessionId: SESSION, count: 1 });
    expect(rpcs()).toEqual([
      ["rpc", "session_conflicts", { p_starts_at: STARTS, p_ends_at: ENDS, p_ignore: SESSION }],
      [
        "rpc",
        "update_session",
        { p_session_id: SESSION, p_starts_at: STARTS, p_duration_min: 60, p_mode: "offline", p_location_id: LOCATION, p_title: "Новое", p_following: false },
      ],
    ]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("changes this and the following sessions of a repeat", async () => {
    db.answers["rpc:update_session"] = { data: 6 };
    expect(await actions.updateSession({ ...edit, following: true, force: true })).toEqual({ status: "done", sessionId: SESSION, count: 6 });
    expect(rpcs("update_session")[0]?.[2]).toMatchObject({ p_following: true });
    expect(rpcs("session_conflicts")).toEqual([]);
  });

  it("returns overlaps instead of saving", async () => {
    db.answers["rpc:session_conflicts"] = { data: [{ session_id: "s-1", starts_at: STARTS, ends_at: ENDS, coaching_id: "pair-a", title: null }] };
    expect(await actions.updateSession(edit)).toMatchObject({ status: "conflict" });
    expect(rpcs("update_session")).toEqual([]);
  });

  it("refuses bad input or no session without the update", async () => {
    expect(await actions.updateSession({ ...edit, sessionId: "s-1" })).toEqual({ status: "error", error: "failed" });
    expect(await actions.updateSession({ ...edit, following: undefined as never })).toEqual({ status: "error", error: "failed" });
    expect(db.calls).toEqual([]);
    db.userId = null;
    expect(await actions.updateSession(edit)).toEqual({ status: "error", error: "failed" });
    expect(rpcs()).toEqual([]);
  });

  it("names known errors and hides others", async () => {
    db.answers["rpc:update_session"] = [
      { error: { message: "following_keeps_date", code: "P0001" } },
      { error: { message: "not_editable", code: "P0001" } },
      { error: UNKNOWN },
    ];
    expect(await actions.updateSession(edit)).toEqual({ status: "error", error: "following_keeps_date" });
    expect(await actions.updateSession(edit)).toEqual({ status: "error", error: "not_editable" });
    expect(await actions.updateSession(edit)).toEqual({ status: "error", error: "failed" });
  });
});

describe("cancelSession", () => {
  it("cancels with the trimmed reason and returns how many", async () => {
    db.answers["rpc:cancel_session"] = { data: 3 };
    expect(await actions.cancelSession({ sessionId: SESSION, reason: "  Заболел  ", following: true })).toEqual({ status: "done", count: 3 });
    expect(rpcs()).toEqual([["rpc", "cancel_session", { p_session_id: SESSION, p_reason: "Заболел", p_following: true }]]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("needs a reason before any call, and refuses one over 500 characters", async () => {
    expect(await actions.cancelSession({ sessionId: SESSION, reason: "  ", following: false })).toEqual({ status: "error", error: "reason_required" });
    expect(await actions.cancelSession({ sessionId: SESSION, reason: "x".repeat(501), following: false })).toEqual({ status: "error", error: "failed" });
    expect(await actions.cancelSession({ sessionId: "s", reason: "x", following: false })).toEqual({ status: "error", error: "failed" });
    expect(db.calls).toEqual([]);
  });

  it("maps a missing reason, known errors and others", async () => {
    db.answers["rpc:cancel_session"] = [
      { error: { message: "reason_required", code: "P0001" } },
      { error: { message: "session_not_found", code: "P0002" } },
      { error: UNKNOWN },
    ];
    const input = { sessionId: SESSION, reason: "x", following: false };
    expect(await actions.cancelSession(input)).toEqual({ status: "error", error: "reason_required" });
    expect(await actions.cancelSession(input)).toEqual({ status: "error", error: "session_not_found" });
    expect(await actions.cancelSession(input)).toEqual({ status: "error", error: "failed" });
    expect(next.refresh).not.toHaveBeenCalled();
  });
});

describe("cancelParticipant", () => {
  it("takes one booking off with the trimmed reason", async () => {
    expect(await actions.cancelParticipant({ bookingId: BOOKING, reason: " Перенос " })).toEqual({ status: "done" });
    expect(rpcs()).toEqual([["rpc", "cancel_participant", { p_booking_id: BOOKING, p_reason: "Перенос" }]]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("needs a reason and a booking id before any call", async () => {
    expect(await actions.cancelParticipant({ bookingId: BOOKING, reason: "" })).toEqual({ status: "error", error: "reason_required" });
    expect(await actions.cancelParticipant({ bookingId: "b", reason: "x" })).toEqual({ status: "error", error: "failed" });
    expect(await actions.cancelParticipant({ bookingId: BOOKING, reason: "x".repeat(501) })).toEqual({ status: "error", error: "failed" });
    expect(db.calls).toEqual([]);
  });

  it("maps a missing reason, a gone booking and other errors", async () => {
    db.answers["rpc:cancel_participant"] = [
      { error: { message: "reason_required", code: "P0001" } },
      { error: { message: "booking_not_found", code: "P0002" } },
      { error: UNKNOWN },
    ];
    expect(await actions.cancelParticipant({ bookingId: BOOKING, reason: "x" })).toEqual({ status: "error", error: "reason_required" });
    expect(await actions.cancelParticipant({ bookingId: BOOKING, reason: "x" })).toEqual({ status: "error", error: "booking_not_found" });
    expect(await actions.cancelParticipant({ bookingId: BOOKING, reason: "x" })).toEqual({ status: "error", error: "failed" });
  });
});

describe("addGroupParticipant", () => {
  it("adds a client, or adds an extra seat for them", async () => {
    expect(await actions.addGroupParticipant({ sessionId: SESSION, coachingId: PAIR })).toEqual({ status: "done" });
    expect(await actions.addGroupParticipant({ sessionId: SESSION, coachingId: PAIR, extra: true })).toEqual({ status: "done" });
    expect(rpcs()).toEqual([
      ["rpc", "add_group_participant", { p_session_id: SESSION, p_coaching_id: PAIR }],
      ["rpc", "add_group_participant_extra", { p_session_id: SESSION, p_coaching_id: PAIR }],
    ]);
    expect(next.refresh).toHaveBeenCalledTimes(2);
  });

  it("refuses bad ids without a call", async () => {
    expect(await actions.addGroupParticipant({ sessionId: "s", coachingId: PAIR })).toEqual({ status: "error", error: "failed" });
    expect(await actions.addGroupParticipant({ sessionId: SESSION, coachingId: "p" })).toEqual({ status: "error", error: "failed" });
    expect(db.calls).toEqual([]);
  });

  it.each(["already_booked", "session_full", "not_your_client", "session_not_found", "capacity_below_occupied"])("names %s", async (message) => {
    db.answers["rpc:add_group_participant"] = { error: { message, code: "P0001" } };
    expect(await actions.addGroupParticipant({ sessionId: SESSION, coachingId: PAIR })).toEqual({ status: "error", error: message });
  });

  it("hides other errors", async () => {
    db.answers["rpc:add_group_participant"] = { error: UNKNOWN };
    expect(await actions.addGroupParticipant({ sessionId: SESSION, coachingId: PAIR })).toEqual({ status: "error", error: "failed" });
    expect(next.refresh).not.toHaveBeenCalled();
  });
});

describe("updateGroupSeats", () => {
  it("changes the seats of the trainer's scheduled group", async () => {
    db.answers.sessions = { data: [{ id: SESSION }] };
    expect(await actions.updateGroupSeats({ sessionId: SESSION, capacity: 12, openForBooking: false })).toEqual({ status: "done" });
    expect(db.calls).toEqual([
      ["sessions", "update", { capacity: 12, open_for_booking: false }, "eq", "id", SESSION, "eq", "kind", "group", "eq", "status", "scheduled", "select", "id"],
    ]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("refuses seats outside 2–100 without a query", async () => {
    expect(await actions.updateGroupSeats({ sessionId: SESSION, capacity: 1, openForBooking: true })).toEqual({ status: "error", error: "failed" });
    expect(await actions.updateGroupSeats({ sessionId: SESSION, capacity: 101, openForBooking: true })).toEqual({ status: "error", error: "failed" });
    expect(await actions.updateGroupSeats({ sessionId: SESSION, capacity: 2.5, openForBooking: true })).toEqual({ status: "error", error: "failed" });
    expect(db.calls).toEqual([]);
  });

  it("reads no row as a gone session, and maps seats below the taken ones", async () => {
    db.answers.sessions = [{ data: [] }, { error: { message: "capacity_below_occupied", code: "P0001" } }, { error: UNKNOWN }];
    const input = { sessionId: SESSION, capacity: 2, openForBooking: true };
    expect(await actions.updateGroupSeats(input)).toEqual({ status: "error", error: "session_not_found" });
    expect(await actions.updateGroupSeats(input)).toEqual({ status: "error", error: "capacity_below_occupied" });
    expect(await actions.updateGroupSeats(input)).toEqual({ status: "error", error: "failed" });
  });
});

describe("offerWaitlistSeat", () => {
  it("offers a seat out of turn", async () => {
    expect(await actions.offerWaitlistSeat(ENTRY)).toEqual({ status: "done" });
    expect(rpcs()).toEqual([["rpc", "trainer_offer_waitlist", { p_entry_id: ENTRY }]]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("refuses a malformed entry without a call", async () => {
    expect(await actions.offerWaitlistSeat("entry-1")).toEqual({ status: "error", error: "failed" });
    expect(db.calls).toEqual([]);
  });

  it("maps a full session, a gone entry and other errors", async () => {
    db.answers["rpc:trainer_offer_waitlist"] = [
      { error: { message: "session_full", code: "P0001" } },
      { error: { message: "waitlist_not_found", code: "P0002" } },
      { error: UNKNOWN },
    ];
    expect(await actions.offerWaitlistSeat(ENTRY)).toEqual({ status: "error", error: "session_full" });
    expect(await actions.offerWaitlistSeat(ENTRY)).toEqual({ status: "error", error: "waitlist_not_found" });
    expect(await actions.offerWaitlistSeat(ENTRY)).toEqual({ status: "error", error: "failed" });
    expect(next.refresh).not.toHaveBeenCalled();
  });
});
