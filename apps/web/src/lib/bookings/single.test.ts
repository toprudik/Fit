import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const next = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/cache", () => ({ refresh: next.refresh }));

type Answer = { data: unknown; error: { message: string; code: string } | null };

/** RPCs made as the signed-in trainer, and what the next one answers. */
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

const { confirmRequestSingle } = await import("./single");

const BOOKING = "00000000-0000-4000-8000-000000000001";
const FAILED = { status: "error", error: "failed" };

beforeEach(() => {
  vi.clearAllMocks();
  db.calls = [];
  db.answer = { data: null, error: null };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("confirmRequestSingle", () => {
  it("confirms the request as a single session named by the trimmed title and refreshes", async () => {
    expect(await confirmRequestSingle({ bookingId: BOOKING, title: "  Разовое занятие " })).toEqual({ status: "done" });
    expect(db.calls).toEqual([
      ["rpc", "decide_booking", { p_booking_id: BOOKING, p_accept: true, p_single: true, p_single_title: "Разовое занятие" }],
    ]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("takes a title of 1 and 120 characters", async () => {
    expect(await confirmRequestSingle({ bookingId: BOOKING, title: "Я" })).toEqual({ status: "done" });
    expect(await confirmRequestSingle({ bookingId: BOOKING, title: "x".repeat(120) })).toEqual({ status: "done" });
  });

  it("refuses a blank or too long title and a bad id without a call", async () => {
    expect(await confirmRequestSingle({ bookingId: BOOKING, title: "" })).toEqual(FAILED);
    expect(await confirmRequestSingle({ bookingId: BOOKING, title: "   " })).toEqual(FAILED);
    expect(await confirmRequestSingle({ bookingId: BOOKING, title: "x".repeat(121) })).toEqual(FAILED);
    expect(await confirmRequestSingle({ bookingId: "nope", title: "Разовое" })).toEqual(FAILED);
    expect(db.calls).toEqual([]);
    expect(next.refresh).not.toHaveBeenCalled();
  });

  it("reads a request already decided apart from other failures", async () => {
    db.answer = { data: null, error: { message: "request_not_found", code: "P0001" } };
    expect(await confirmRequestSingle({ bookingId: BOOKING, title: "Разовое" })).toEqual({ status: "error", error: "request_not_found" });
    db.answer = { data: null, error: { message: "slot_unavailable", code: "P0001" } };
    expect(await confirmRequestSingle({ bookingId: BOOKING, title: "Разовое" })).toEqual(FAILED);
    db.answer = { data: null, error: { message: "boom", code: "XX000" } };
    expect(await confirmRequestSingle({ bookingId: BOOKING, title: "Разовое" })).toEqual(FAILED);
    expect(next.refresh).not.toHaveBeenCalled();
  });
});
