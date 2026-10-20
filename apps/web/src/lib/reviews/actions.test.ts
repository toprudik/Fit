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

const { deleteReview, disputeReview, replyToReview, saveReview } = await import("./actions");

const PAIR = "00000000-0000-4000-8000-000000000001";
const REVIEW = "00000000-0000-4000-8000-000000000002";
const LONG = "x".repeat(2001);
const UNKNOWN = { message: "something internal broke", code: "XX000" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  Object.assign(db, { calls: [], answer: {} });
});

describe("saveReview", () => {
  it("saves the rating with the trimmed text and refreshes", async () => {
    expect(await saveReview({ coachingId: PAIR, rating: 5, body: "  Отличный тренер  " })).toEqual({ ok: true });
    expect(db.calls).toEqual([["save_review", { p_coaching_id: PAIR, p_rating: 5, p_body: "Отличный тренер" }]]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("sends no text when it is empty and takes 2000 characters", async () => {
    await saveReview({ coachingId: PAIR, rating: 1, body: "   " });
    await saveReview({ coachingId: PAIR, rating: 3, body: "x".repeat(2000) });
    expect(db.calls).toEqual([
      ["save_review", { p_coaching_id: PAIR, p_rating: 1, p_body: null }],
      ["save_review", { p_coaching_id: PAIR, p_rating: 3, p_body: "x".repeat(2000) }],
    ]);
  });

  it("refuses a rating outside 1–5, a bad pair or a long text without a call", async () => {
    for (const rating of [0, 6, 4.5, Number.NaN]) expect(await saveReview({ coachingId: PAIR, rating, body: null })).toEqual({ ok: false, reason: "invalid" });
    expect(await saveReview({ coachingId: "pair-1", rating: 5, body: null })).toEqual({ ok: false, reason: "invalid" });
    expect(await saveReview({ coachingId: PAIR, rating: 5, body: LONG })).toEqual({ ok: false, reason: "invalid" });
    expect(db.calls).toEqual([]);
  });

  it("tells too few sessions, a refusal and a failure apart", async () => {
    db.answer = { error: { message: "too_few_sessions", code: "P0001" } };
    expect(await saveReview({ coachingId: PAIR, rating: 5, body: null })).toEqual({ ok: false, reason: "tooFew" });
    db.answer = { error: { message: "not_your_coaching", code: "42501" } };
    expect(await saveReview({ coachingId: PAIR, rating: 5, body: null })).toEqual({ ok: false, reason: "invalid" });
    db.answer = { error: { message: "bad_rating", code: "22023" } };
    expect(await saveReview({ coachingId: PAIR, rating: 5, body: null })).toEqual({ ok: false, reason: "invalid" });
    db.answer = { error: UNKNOWN };
    expect(await saveReview({ coachingId: PAIR, rating: 5, body: null })).toEqual({ ok: false, reason: "failed" });
    expect(next.refresh).not.toHaveBeenCalled();
  });
});

describe("deleteReview", () => {
  it("removes the author's review", async () => {
    db.answer = { data: true };
    expect(await deleteReview(PAIR)).toEqual({ ok: true });
    expect(db.calls).toEqual([["delete_review", { p_coaching_id: PAIR }]]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("reads nothing removed as invalid and an error as failed", async () => {
    db.answer = { data: false };
    expect(await deleteReview(PAIR)).toEqual({ ok: false, reason: "invalid" });
    db.answer = { error: { message: "forbidden", code: "42501" } };
    expect(await deleteReview(PAIR)).toEqual({ ok: false, reason: "failed" });
    expect(next.refresh).not.toHaveBeenCalled();
  });

  it("refuses a malformed id without a call", async () => {
    expect(await deleteReview("pair-1")).toEqual({ ok: false, reason: "invalid" });
    expect(db.calls).toEqual([]);
  });
});

describe("replyToReview", () => {
  it("answers with the trimmed text, or removes the answer with an empty one", async () => {
    expect(await replyToReview({ reviewId: REVIEW, body: " Спасибо! " })).toEqual({ ok: true });
    expect(await replyToReview({ reviewId: REVIEW, body: null })).toEqual({ ok: true });
    expect(db.calls).toEqual([
      ["reply_to_review", { p_review_id: REVIEW, p_body: "Спасибо!" }],
      ["reply_to_review", { p_review_id: REVIEW, p_body: null }],
    ]);
    expect(next.refresh).toHaveBeenCalledTimes(2);
  });

  it("refuses a bad id or a long text without a call", async () => {
    expect(await replyToReview({ reviewId: "review-1", body: "Спасибо" })).toEqual({ ok: false, reason: "invalid" });
    expect(await replyToReview({ reviewId: REVIEW, body: LONG })).toEqual({ ok: false, reason: "invalid" });
    expect(db.calls).toEqual([]);
  });

  it("maps a refusal to invalid and anything else to failed", async () => {
    db.answer = { error: { message: "not_your_review", code: "42501" } };
    expect(await replyToReview({ reviewId: REVIEW, body: "x" })).toEqual({ ok: false, reason: "invalid" });
    db.answer = { error: { message: "already_replied", code: "22023" } };
    expect(await replyToReview({ reviewId: REVIEW, body: "x" })).toEqual({ ok: false, reason: "invalid" });
    db.answer = { error: UNKNOWN };
    expect(await replyToReview({ reviewId: REVIEW, body: "x" })).toEqual({ ok: false, reason: "failed" });
  });
});

describe("disputeReview", () => {
  it("sends the review to the admin with the reason and the trimmed text", async () => {
    expect(await disputeReview({ reviewId: REVIEW, reason: "not_my_client", body: "  Не знаю этого человека " })).toEqual({ ok: true });
    expect(db.calls).toEqual([["dispute_review", { p_review_id: REVIEW, p_reason: "not_my_client", p_body: "Не знаю этого человека" }]]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("refuses an unknown reason, a bad id or a long text without a call", async () => {
    expect(await disputeReview({ reviewId: REVIEW, reason: "spam" as never, body: null })).toEqual({ ok: false, reason: "invalid" });
    expect(await disputeReview({ reviewId: "r", reason: "other", body: null })).toEqual({ ok: false, reason: "invalid" });
    expect(await disputeReview({ reviewId: REVIEW, reason: "other", body: LONG })).toEqual({ ok: false, reason: "invalid" });
    expect(db.calls).toEqual([]);
  });

  it("maps a refusal to invalid and anything else to failed", async () => {
    db.answer = { error: { message: "already_disputed", code: "22023" } };
    expect(await disputeReview({ reviewId: REVIEW, reason: "insult", body: null })).toEqual({ ok: false, reason: "invalid" });
    db.answer = { error: UNKNOWN };
    expect(await disputeReview({ reviewId: REVIEW, reason: "insult", body: null })).toEqual({ ok: false, reason: "failed" });
  });
});
