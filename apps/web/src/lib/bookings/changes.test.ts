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

const { cancelBooking, previewCancel, previewReschedule, rescheduleBooking } = await import("./changes");

const BOOKING = "00000000-0000-4000-8000-000000000001";
const SLOT = "00000000-0000-4000-8000-000000000002";
const NEW_BOOKING = "00000000-0000-4000-8000-000000000003";
const FAILED = { status: "error", error: "failed" };
const fail = (message: string, code = "P0001") => ({ data: null, error: { message, code } });

let logged: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  db.calls = [];
  db.answer = { data: null, error: null };
  logged = vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("cancelBooking", () => {
  it("cancels for free before the deadline, without a reason when it is blank, and refreshes", async () => {
    db.answer = { data: "cancelled", error: null };
    expect(await cancelBooking({ bookingId: BOOKING, reason: "  ", late: false })).toEqual({ status: "done", late: false });
    expect(db.calls).toEqual([["rpc", "cancel_my_booking", { p_booking_id: BOOKING, p_late: false }]]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("cancels late with the trimmed reason and says it was late", async () => {
    db.answer = { data: "late_cancelled", error: null };
    expect(await cancelBooking({ bookingId: BOOKING, reason: "  Заболела ", late: true })).toEqual({ status: "done", late: true });
    expect(db.calls).toEqual([["rpc", "cancel_my_booking", { p_booking_id: BOOKING, p_late: true, p_reason: "Заболела" }]]);
  });

  it("takes a 500-character reason and reads a longer one as invalid_reason, without a call", async () => {
    expect(await cancelBooking({ bookingId: BOOKING, reason: "x".repeat(500), late: false })).toMatchObject({ status: "done" });
    db.calls = [];
    expect(await cancelBooking({ bookingId: BOOKING, reason: "x".repeat(501), late: false })).toEqual({ status: "error", error: "invalid_reason" });
    expect(db.calls).toEqual([]);
  });

  it("refuses a bad id or a missing late flag as failed, without a call", async () => {
    expect(await cancelBooking({ bookingId: "nope", reason: "", late: false })).toEqual(FAILED);
    expect(await cancelBooking({ bookingId: BOOKING, reason: "", late: "no" as unknown as boolean })).toEqual(FAILED);
    expect(await cancelBooking({ bookingId: BOOKING, late: false } as unknown as { bookingId: string; reason: string; late: boolean })).toEqual(FAILED);
    expect(db.calls).toEqual([]);
    expect(next.refresh).not.toHaveBeenCalled();
  });

  it("passes late_cancel, booking_not_found and invalid_reason through and hides anything else", async () => {
    for (const message of ["late_cancel", "booking_not_found", "invalid_reason"]) {
      db.answer = fail(message);
      expect(await cancelBooking({ bookingId: BOOKING, reason: "", late: false })).toEqual({ status: "error", error: message });
    }
    db.answer = fail("too_late");
    expect(await cancelBooking({ bookingId: BOOKING, reason: "", late: false })).toEqual(FAILED);
    db.answer = fail("internal detail", "XX000");
    expect(await cancelBooking({ bookingId: BOOKING, reason: "", late: false })).toEqual(FAILED);
    expect(logged).toHaveBeenCalledWith("cancelling a booking failed", "XX000");
    expect(next.refresh).not.toHaveBeenCalled();
  });
});

describe("previewCancel", () => {
  it("asks cancel_preview for the booking", async () => {
    db.answer = { data: [{ charged: false }], error: null };
    expect(await previewCancel(BOOKING)).toEqual({ kind: "free" });
    expect(db.calls).toEqual([["rpc", "cancel_preview", { p_booking_id: BOOKING }]]);
  });

  it("names a session of a pass, never a negative balance", async () => {
    db.answer = { data: [{ charged: true, pass_title: "5 занятий", sessions_left: 2 }], error: null };
    expect(await previewCancel(BOOKING)).toEqual({ kind: "pass", passTitle: "5 занятий", sessionsLeft: 2 });
    db.answer = { data: [{ charged: true, pass_title: "5 занятий", sessions_left: -1 }], error: null };
    expect(await previewCancel(BOOKING)).toEqual({ kind: "pass", passTitle: "5 занятий", sessionsLeft: 0 });
    db.answer = { data: [{ charged: true, pass_title: "5 занятий", sessions_left: null }], error: null };
    expect(await previewCancel(BOOKING)).toEqual({ kind: "pass", passTitle: "5 занятий", sessionsLeft: 0 });
  });

  it("names debt at the drop-in price", async () => {
    db.answer = { data: [{ charged: true, pass_title: null, debt_minor: 200000, currency: "RUB" }], error: null };
    expect(await previewCancel(BOOKING)).toEqual({ kind: "debt", amountMinor: 200000, currency: "RUB" });
  });

  it("answers null for a charge it cannot name, an empty answer, an error and a bad id", async () => {
    db.answer = { data: [{ charged: true, pass_title: null, debt_minor: null, currency: null }], error: null };
    expect(await previewCancel(BOOKING)).toBeNull();
    db.answer = { data: [], error: null };
    expect(await previewCancel(BOOKING)).toBeNull();
    db.answer = fail("boom", "XX000");
    expect(await previewCancel(BOOKING)).toBeNull();
    db.calls = [];
    expect(await previewCancel("nope")).toBeNull();
    expect(db.calls).toEqual([]);
  });
});

describe("previewReschedule", () => {
  it("says what pays for the new time", async () => {
    db.answer = { data: [{ confirmed: true, pass_title: "10 занятий", sessions_left: 5 }], error: null };
    expect(await previewReschedule(BOOKING, SLOT)).toEqual({ status: "done", confirmed: true, passTitle: "10 занятий", sessionsLeft: 5 });
    expect(db.calls).toEqual([["rpc", "reschedule_preview", { p_booking_id: BOOKING, p_slot_id: SLOT }]]);
    expect(next.refresh).not.toHaveBeenCalled();
  });

  it("reads an empty answer as a request with no pass", async () => {
    db.answer = { data: [], error: null };
    expect(await previewReschedule(BOOKING, SLOT)).toEqual({ status: "done", confirmed: false, passTitle: null, sessionsLeft: null });
  });

  it("refuses a bad booking or slot id without a call", async () => {
    expect(await previewReschedule("nope", SLOT)).toEqual(FAILED);
    expect(await previewReschedule(BOOKING, "nope")).toEqual(FAILED);
    expect(db.calls).toEqual([]);
  });

  it("reads a taken slot, a passed deadline and anything else apart", async () => {
    db.answer = fail("slot_unavailable");
    expect(await previewReschedule(BOOKING, SLOT)).toEqual({ status: "error", error: "slot_unavailable" });
    db.answer = fail("deadline_passed");
    expect(await previewReschedule(BOOKING, SLOT)).toEqual({ status: "error", error: "too_late" });
    db.answer = fail("too_late");
    expect(await previewReschedule(BOOKING, SLOT)).toEqual({ status: "error", error: "too_late" });
    db.answer = fail("booking_not_found");
    expect(await previewReschedule(BOOKING, SLOT)).toEqual(FAILED);
  });
});

describe("rescheduleBooking", () => {
  it("moves the booking, returns the new one and refreshes", async () => {
    db.answer = { data: [{ booking_id: NEW_BOOKING, status: "confirmed" }], error: null };
    expect(await rescheduleBooking(BOOKING, SLOT)).toEqual({ status: "done", bookingId: NEW_BOOKING, confirmed: true });
    expect(db.calls).toEqual([["rpc", "reschedule_my_booking", { p_booking_id: BOOKING, p_slot_id: SLOT }]]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("returns a request when the new time needs the trainer's yes", async () => {
    db.answer = { data: [{ booking_id: NEW_BOOKING, status: "requested" }], error: null };
    expect(await rescheduleBooking(BOOKING, SLOT)).toEqual({ status: "done", bookingId: NEW_BOOKING, confirmed: false });
  });

  it("refuses bad ids without a call", async () => {
    expect(await rescheduleBooking("nope", SLOT)).toEqual(FAILED);
    expect(await rescheduleBooking(BOOKING, "")).toEqual(FAILED);
    expect(db.calls).toEqual([]);
  });

  it("maps the move errors and refreshes nothing on failure", async () => {
    db.answer = fail("slot_unavailable");
    expect(await rescheduleBooking(BOOKING, SLOT)).toEqual({ status: "error", error: "slot_unavailable" });
    db.answer = fail("deadline_passed");
    expect(await rescheduleBooking(BOOKING, SLOT)).toEqual({ status: "error", error: "too_late" });
    db.answer = fail("boom", "XX000");
    expect(await rescheduleBooking(BOOKING, SLOT)).toEqual(FAILED);
    expect(logged).toHaveBeenCalledWith("moving a booking failed", "XX000");
    expect(next.refresh).not.toHaveBeenCalled();
  });
});
