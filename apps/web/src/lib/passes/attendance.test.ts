import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const next = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/cache", () => ({ refresh: next.refresh }));

type Answer = { data?: unknown; error?: { message: string; code: string } | null };

/** RPCs called as the signed-in user, and what the next one answers. */
const db = vi.hoisted(() => ({ calls: [] as unknown[][], answer: {} as Answer }));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    rpc: async (fn: string, args: unknown) => {
      db.calls.push([fn, args]);
      return { data: null, error: null, ...db.answer };
    },
  }),
}));

const { markAttendance } = await import("./attendance");

const BOOKING = "00000000-0000-4000-8000-000000000001";

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  Object.assign(db, { calls: [], answer: {} });
});

describe("markAttendance", () => {
  it("marks a booking attended without a reason and refreshes", async () => {
    expect(await markAttendance({ bookingId: BOOKING, mark: "attended", reason: "   " })).toEqual({ status: "done" });
    expect(db.calls).toEqual([["mark_attendance", { p_booking_id: BOOKING, p_status: "attended" }]]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("sends the trimmed reason with a no-show", async () => {
    await markAttendance({ bookingId: BOOKING, mark: "no_show", reason: "  Заболел  " });
    expect(db.calls).toEqual([["mark_attendance", { p_booking_id: BOOKING, p_status: "no_show", p_reason: "Заболел" }]]);
  });

  it("needs a reason to mark a session that did not happen, before any call", async () => {
    expect(await markAttendance({ bookingId: BOOKING, mark: "cancelled", reason: "  " })).toEqual({ status: "error", error: "reason_required" });
    expect(db.calls).toEqual([]);
    expect(await markAttendance({ bookingId: BOOKING, mark: "cancelled", reason: "Зал закрыт" })).toEqual({ status: "done" });
    expect(db.calls).toEqual([["mark_attendance", { p_booking_id: BOOKING, p_status: "cancelled", p_reason: "Зал закрыт" }]]);
  });

  it("takes a reason of 500 characters and refuses 501 by name", async () => {
    expect(await markAttendance({ bookingId: BOOKING, mark: "no_show", reason: "x".repeat(500) })).toEqual({ status: "done" });
    db.calls = [];
    expect(await markAttendance({ bookingId: BOOKING, mark: "no_show", reason: "x".repeat(501) })).toEqual({ status: "error", error: "reason_too_long" });
    expect(db.calls).toEqual([]);
  });

  it("refuses a malformed booking id or an unknown mark without a call", async () => {
    expect(await markAttendance({ bookingId: "booking-1", mark: "attended", reason: "" })).toEqual({ status: "error", error: "failed" });
    expect(await markAttendance({ bookingId: BOOKING, mark: "late" as never, reason: "" })).toEqual({ status: "error", error: "failed" });
    expect(db.calls).toEqual([]);
    expect(next.refresh).not.toHaveBeenCalled();
  });

  it.each(["not_started", "reason_required", "reason_too_long", "invalid_status"] as const)("names the database's %s", async (message) => {
    db.answer = { error: { message, code: "P0001" } };
    expect(await markAttendance({ bookingId: BOOKING, mark: "attended", reason: "" })).toEqual({ status: "error", error: message });
    expect(next.refresh).not.toHaveBeenCalled();
  });

  it("reports any other error as failed without its text", async () => {
    db.answer = { error: { message: "permission denied for table bookings", code: "42501" } };
    expect(await markAttendance({ bookingId: BOOKING, mark: "attended", reason: "" })).toEqual({ status: "error", error: "failed" });
    expect(next.refresh).not.toHaveBeenCalled();
  });
});
