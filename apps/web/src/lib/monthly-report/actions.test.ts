import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Answer = { data: unknown; error: { message: string; code: string } | null };

/** RPC calls made as the signed-in user, and what the next one answers. */
const db = vi.hoisted(() => ({ calls: [] as unknown[][], answer: { data: null, error: null } as Answer }));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    rpc: (fn: string, args: unknown) => {
      db.calls.push([fn, args]);
      return Promise.resolve(db.answer);
    },
  }),
}));

const { createStoryCard, shareMonthlyReport } = await import("./actions");

const PAIR = "00000000-0000-4000-8000-000000000001";
const CARD = "00000000-0000-4000-8000-000000000002";
const broken = { data: null, error: { code: "XX000", message: "internal detail" } };

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  db.calls = [];
  db.answer = { data: CARD, error: null };
});

describe("createStoryCard", () => {
  it("creates a card for the month through create_story_card and returns its id", async () => {
    expect(await createStoryCard({ month: "2026-09", kind: "sessions" })).toEqual({ status: "created", id: CARD });
    expect(db.calls).toEqual([["create_story_card", { p_month: "2026-09-01", p_kind: "sessions", p_coaching: undefined, p_confirm: false }]]);
  });

  it("sends the pair only for a trainer card", async () => {
    await createStoryCard({ month: "2026-09", kind: "trainer", coachingId: PAIR });
    await createStoryCard({ month: "2026-09", kind: "records", coachingId: PAIR });
    expect(db.calls.map((call) => (call[1] as { p_coaching: unknown }).p_coaching)).toEqual([PAIR, undefined]);
  });

  it("confirms only a weight card, and only when asked", async () => {
    await createStoryCard({ month: "2026-09", kind: "weight", confirm: true });
    await createStoryCard({ month: "2026-09", kind: "weight" });
    await createStoryCard({ month: "2026-09", kind: "badges", confirm: true });
    expect(db.calls.map((call) => (call[1] as { p_confirm: unknown }).p_confirm)).toEqual([true, false, false]);
  });

  it.each([
    ["a month without a leading zero", { month: "2026-9", kind: "sessions" }],
    ["month 13", { month: "2026-13", kind: "sessions" }],
    ["month 00", { month: "2026-00", kind: "sessions" }],
    ["a full date", { month: "2026-09-01", kind: "sessions" }],
    ["an unknown kind", { month: "2026-09", kind: "selfie" }],
  ])("refuses %s without a call", async (_label, input) => {
    expect(await createStoryCard(input)).toEqual({ status: "failed" });
    expect(db.calls).toEqual([]);
  });

  it("asks for the consent to publish before the first card (152-FZ art. 10.1)", async () => {
    db.answer = { data: null, error: { code: "P0001", message: "consent_required" } };
    expect(await createStoryCard({ month: "2026-09", kind: "sessions" })).toEqual({ status: "consent" });
  });

  it("fails on an error or an answer that is not an id", async () => {
    db.answer = broken;
    expect(await createStoryCard({ month: "2026-09", kind: "sessions" })).toEqual({ status: "failed" });
    db.answer = { data: null, error: null };
    expect(await createStoryCard({ month: "2026-09", kind: "sessions" })).toEqual({ status: "failed" });
  });
});

describe("shareMonthlyReport", () => {
  it("sends the month to the pair's trainer through share_monthly_report", async () => {
    db.answer = { data: null, error: null };
    expect(await shareMonthlyReport({ month: "2026-09", coachingId: PAIR })).toEqual({ status: "sent" });
    expect(db.calls).toEqual([["share_monthly_report", { p_month: "2026-09-01", p_coaching: PAIR }]]);
  });

  it("refuses a malformed month or pair without a call", async () => {
    expect(await shareMonthlyReport({ month: "09-2026", coachingId: PAIR })).toEqual({ status: "failed" });
    expect(await shareMonthlyReport({ month: "2026-09", coachingId: "pair-1" })).toEqual({ status: "failed" });
    expect(db.calls).toEqual([]);
  });

  it("fails when the database refuses (the pair has ended)", async () => {
    db.answer = { data: null, error: { code: "42501", message: "pair_ended" } };
    expect(await shareMonthlyReport({ month: "2026-09", coachingId: PAIR })).toEqual({ status: "failed" });
  });
});
