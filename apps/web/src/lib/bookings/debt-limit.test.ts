import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));

type Answer = { data: unknown; error: { message: string; code: string } | null };

/** What the next RPC answers. */
const db = vi.hoisted(() => ({ answer: { data: null, error: null } as Answer }));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ rpc: () => Promise.resolve(db.answer) }),
}));

const { acceptWaitlistOffer, bookGroupSession, bookSlot } = await import("./actions");
const { rescheduleBooking } = await import("./changes");

const ID = "0b7c2f4e-1d2a-4c3b-9e8f-7a6b5c4d3e2f";
const SLOT = "1c8d3a5f-2e3b-4d4c-8f9a-8b7c6d5e4f3a";

beforeEach(() => {
  db.answer = { data: null, error: null };
});

describe("the debt limit (Q22)", () => {
  it.each([
    ["a slot", () => bookSlot(SLOT)],
    ["a group session", () => bookGroupSession(SLOT)],
    ["a move", () => rescheduleBooking(ID, SLOT)],
  ])("explains a refused booking of %s", async (_, book) => {
    db.answer = { data: null, error: { message: "debt_limit", code: "P0001" } };
    expect(await book()).toEqual({ status: "error", error: "debt_limit" });
  });

  it("explains a waitlist offer passed on to the next in line", async () => {
    db.answer = { data: [{ booking_id: null, status: "declined" }], error: null };
    expect(await acceptWaitlistOffer(ID)).toEqual({ status: "error", error: "debt_limit" });
  });

  it("still takes an offer within the limit", async () => {
    db.answer = { data: [{ booking_id: SLOT, status: "requested" }], error: null };
    expect(await acceptWaitlistOffer(ID)).toEqual({ status: "done", bookingId: SLOT, confirmed: false });
  });
});
