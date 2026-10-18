import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const next = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/cache", () => ({ refresh: next.refresh }));

type Answer = { data: unknown; error: { message: string; code: string } | null };

/** RPCs made as the signed-in user, and what the next one answers. */
const db = vi.hoisted(() => ({
  calls: [] as unknown[][],
  answer: { data: null, error: null } as Answer,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    rpc: (fn: string, args: unknown) => {
      db.calls.push(["rpc", fn, args]);
      return Promise.resolve(db.answer);
    },
  }),
}));

const actions = await import("./actions");
const {
  acceptWaitlistOffer,
  bookGroupSession,
  bookSlot,
  bookTrial,
  decideRequest,
  joinSlotWaitlist,
  joinWaitlist,
  leaveWaitlist,
  previewBooking,
  previewGroupBooking,
  withdrawRequest,
} = actions;

const ID = "00000000-0000-4000-8000-000000000001";
const BOOKING = "00000000-0000-4000-8000-000000000002";
const TOKEN = "AbCdEfGhIjKlMnOpQrSt_-";
const BAD_IDS = ["", "nope", "00000000-0000-4000-8000-00000000000", "1; drop table bookings"];
const FAILED = { status: "error", error: "failed" };

/** Every error the screens explain in words: the action must pass each one through as is. */
const KNOWN = [
  "slot_unavailable",
  "too_late",
  "request_not_found",
  "invalid_reason",
  "invite_invalid",
  "trainer_unavailable",
  "own_invite",
  "already_client",
  "trial_used",
  "plan_limit_reached",
  "session_full",
  "already_booked",
  "already_waiting",
  "seats_available",
  "waitlist_not_found",
  "offer_expired",
  "account_deleting",
];

const fail = (message: string, code = "P0001") => ({ data: null, error: { message, code } });

let logged: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  db.calls = [];
  db.answer = { data: null, error: null };
  logged = vi.spyOn(console, "error").mockImplementation(() => {});
});

/** The id-only actions: what each sends and whether it refreshes. */
const simple = [
  { name: "previewBooking", run: actions.previewBooking, rpc: "booking_preview", arg: "p_slot_id", refreshes: false },
  { name: "bookSlot", run: actions.bookSlot, rpc: "book_slot", arg: "p_slot_id", refreshes: true },
  { name: "previewGroupBooking", run: actions.previewGroupBooking, rpc: "group_booking_preview", arg: "p_session_id", refreshes: false },
  { name: "bookGroupSession", run: actions.bookGroupSession, rpc: "book_group_session", arg: "p_session_id", refreshes: true },
  { name: "withdrawRequest", run: actions.withdrawRequest, rpc: "withdraw_booking_request", arg: "p_booking_id", refreshes: true },
  { name: "joinWaitlist", run: actions.joinWaitlist, rpc: "join_waitlist", arg: "p_session_id", refreshes: true },
  { name: "joinSlotWaitlist", run: actions.joinSlotWaitlist, rpc: "join_slot_waitlist", arg: "p_slot_id", refreshes: true },
  { name: "leaveWaitlist", run: actions.leaveWaitlist, rpc: "leave_waitlist", arg: "p_entry_id", refreshes: true },
  { name: "acceptWaitlistOffer", run: actions.acceptWaitlistOffer, rpc: "accept_waitlist_offer", arg: "p_entry_id", refreshes: true },
] as const;

describe.each(simple)("$name: shared rules", ({ run, rpc, arg, refreshes }) => {
  it("refuses a malformed id without a call", async () => {
    for (const bad of BAD_IDS) expect(await run(bad)).toEqual(FAILED);
    expect(db.calls).toEqual([]);
    expect(next.refresh).not.toHaveBeenCalled();
  });

  it(`sends ${rpc} with ${arg}`, async () => {
    db.answer = { data: [{ booking_id: BOOKING, status: "confirmed", entry_id: BOOKING, place: 1, confirmed: true }], error: null };
    await run(ID);
    expect(db.calls).toEqual([["rpc", rpc, { [arg]: ID }]]);
    expect(next.refresh).toHaveBeenCalledTimes(refreshes ? 1 : 0);
  });

  it("passes every known error through and hides an unknown one", async () => {
    for (const message of KNOWN) {
      db.answer = fail(message);
      expect(await run(ID)).toEqual({ status: "error", error: message });
    }
    db.answer = fail("duplicate key value violates unique constraint bookings_pkey", "23505");
    expect(await run(ID)).toEqual(FAILED);
    expect(logged).toHaveBeenCalledWith(expect.stringMatching(/failed$/), "23505");
    expect(next.refresh).not.toHaveBeenCalled();
  });
});

describe("previewBooking", () => {
  it("says what covers the slot", async () => {
    db.answer = { data: [{ confirmed: true, pass_title: "10 занятий", sessions_left: 4 }], error: null };
    expect(await previewBooking(ID)).toEqual({ status: "done", confirmed: true, passTitle: "10 занятий", sessionsLeft: 4 });
  });

  it("reads an empty answer as a request with no pass", async () => {
    db.answer = { data: [], error: null };
    expect(await previewBooking(ID)).toEqual({ status: "done", confirmed: false, passTitle: null, sessionsLeft: null });
  });
});

describe("previewGroupBooking", () => {
  it("says what covers the seat", async () => {
    db.answer = { data: [{ confirmed: false, pass_title: null, sessions_left: null }], error: null };
    expect(await previewGroupBooking(ID)).toEqual({ status: "done", confirmed: false, passTitle: null, sessionsLeft: null });
  });
});

describe("bookSlot", () => {
  it("returns a confirmed booking", async () => {
    db.answer = { data: [{ booking_id: BOOKING, status: "confirmed" }], error: null };
    expect(await bookSlot(ID)).toEqual({ status: "done", bookingId: BOOKING, confirmed: true });
  });

  it("returns a request that holds the slot", async () => {
    db.answer = { data: [{ booking_id: BOOKING, status: "requested" }], error: null };
    expect(await bookSlot(ID)).toEqual({ status: "done", bookingId: BOOKING, confirmed: false });
  });
});

describe("bookGroupSession", () => {
  it("returns the seat and whether it is confirmed", async () => {
    db.answer = { data: [{ booking_id: BOOKING, status: "requested" }], error: null };
    expect(await bookGroupSession(ID)).toEqual({ status: "done", bookingId: BOOKING, confirmed: false });
  });
});

describe("acceptWaitlistOffer", () => {
  it("turns the offer into a booking", async () => {
    db.answer = { data: [{ booking_id: BOOKING, status: "confirmed" }], error: null };
    expect(await acceptWaitlistOffer(ID)).toEqual({ status: "done", bookingId: BOOKING, confirmed: true });
  });
});

describe("joinWaitlist and joinSlotWaitlist", () => {
  it("return the entry and the place in line", async () => {
    db.answer = { data: [{ entry_id: BOOKING, place: 3 }], error: null };
    expect(await joinWaitlist(ID)).toEqual({ status: "done", entryId: BOOKING, place: 3 });
    expect(await joinSlotWaitlist(ID)).toEqual({ status: "done", entryId: BOOKING, place: 3 });
  });
});

describe("withdrawRequest and leaveWaitlist", () => {
  it("answer done", async () => {
    expect(await withdrawRequest(ID)).toEqual({ status: "done" });
    expect(await leaveWaitlist(ID)).toEqual({ status: "done" });
  });
});

describe("bookTrial", () => {
  it("books a trial request with the token and slot and refreshes", async () => {
    db.answer = { data: [{ booking_id: BOOKING, status: "confirmed" }], error: null };
    // A trial is always a request, whatever status the row carries.
    expect(await bookTrial(TOKEN, ID)).toEqual({ status: "done", bookingId: BOOKING, confirmed: false });
    expect(db.calls).toEqual([["rpc", "book_trial", { p_token: TOKEN, p_slot_id: ID }]]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("refuses a malformed token or slot without a call", async () => {
    for (const token of ["", "short", `${TOKEN}x`, "AbCdEfGhIjKlMnOpQrSt.!"]) expect(await bookTrial(token, ID)).toEqual(FAILED);
    expect(await bookTrial(TOKEN, "nope")).toEqual(FAILED);
    expect(db.calls).toEqual([]);
  });

  it("passes the trial errors through and hides an unknown one", async () => {
    for (const message of ["invite_invalid", "trial_used", "own_invite", "already_client", "slot_unavailable"]) {
      db.answer = fail(message);
      expect(await bookTrial(TOKEN, ID)).toEqual({ status: "error", error: message });
    }
    db.answer = fail("boom", "XX000");
    expect(await bookTrial(TOKEN, ID)).toEqual(FAILED);
    expect(next.refresh).not.toHaveBeenCalled();
  });
});

describe("decideRequest", () => {
  it("accepts a request without a reason", async () => {
    expect(await decideRequest({ bookingId: ID, accept: true, reason: "   " })).toEqual({ status: "done" });
    expect(db.calls).toEqual([["rpc", "decide_booking", { p_booking_id: ID, p_accept: true }]]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("declines with the trimmed reason", async () => {
    expect(await decideRequest({ bookingId: ID, accept: false, reason: "  Заболел  " })).toEqual({ status: "done" });
    expect(db.calls).toEqual([["rpc", "decide_booking", { p_booking_id: ID, p_accept: false, p_reason: "Заболел" }]]);
  });

  it("takes a reason of 500 characters and reads a longer one as invalid_reason, without a call", async () => {
    expect(await decideRequest({ bookingId: ID, accept: false, reason: "x".repeat(500) })).toEqual({ status: "done" });
    db.calls = [];
    expect(await decideRequest({ bookingId: ID, accept: false, reason: "x".repeat(501) })).toEqual({ status: "error", error: "invalid_reason" });
    expect(db.calls).toEqual([]);
  });

  it("refuses a bad booking id or a non-boolean answer as failed, without a call", async () => {
    expect(await decideRequest({ bookingId: "nope", accept: true, reason: "" })).toEqual(FAILED);
    expect(await decideRequest({ bookingId: ID, accept: "yes" as unknown as boolean, reason: "" })).toEqual(FAILED);
    expect(await decideRequest({ bookingId: ID, accept: true } as unknown as { bookingId: string; accept: boolean; reason: string })).toEqual(FAILED);
    expect(db.calls).toEqual([]);
  });

  it("passes request_not_found through and hides an unknown error", async () => {
    db.answer = fail("request_not_found");
    expect(await decideRequest({ bookingId: ID, accept: true, reason: "" })).toEqual({ status: "error", error: "request_not_found" });
    db.answer = fail("boom", "XX000");
    expect(await decideRequest({ bookingId: ID, accept: true, reason: "" })).toEqual(FAILED);
    expect(next.refresh).not.toHaveBeenCalled();
  });
});
