import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const next = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/cache", () => ({ refresh: next.refresh }));

type Answer = { data: unknown; error: { message: string; code: string } | null };

/** RPCs made as the signed-in user (the RPC itself checks the admin), and what the next one answers. */
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

const { decideReviewDispute } = await import("./review-actions");

const REPORT = "00000000-0000-4000-8000-000000000001";

beforeEach(() => {
  vi.clearAllMocks();
  db.calls = [];
  db.answer = { data: null, error: null };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("decideReviewDispute", () => {
  it("keeps a review without sending a reason and refreshes", async () => {
    expect(await decideReviewDispute({ reportId: REPORT, hide: false, reason: "ignored" })).toEqual({ status: "done" });
    expect(db.calls).toEqual([["rpc", "admin_decide_review_dispute", { p_report_id: REPORT, p_hide: false, p_reason: undefined }]]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("hides a review with the trimmed reason", async () => {
    expect(await decideReviewDispute({ reportId: REPORT, hide: true, reason: "  Оскорбления  " })).toEqual({ status: "done" });
    expect(db.calls).toEqual([["rpc", "admin_decide_review_dispute", { p_report_id: REPORT, p_hide: true, p_reason: "Оскорбления" }]]);
  });

  it("takes a reason of exactly 2000 characters", async () => {
    expect(await decideReviewDispute({ reportId: REPORT, hide: true, reason: "x".repeat(2000) })).toEqual({ status: "done" });
  });

  it("refuses hiding without a reason, with a blank or too long one, and a bad id, without a call", async () => {
    expect(await decideReviewDispute({ reportId: REPORT, hide: true })).toEqual({ status: "invalid" });
    expect(await decideReviewDispute({ reportId: REPORT, hide: true, reason: "   " })).toEqual({ status: "invalid" });
    expect(await decideReviewDispute({ reportId: REPORT, hide: true, reason: "x".repeat(2001) })).toEqual({ status: "invalid" });
    expect(await decideReviewDispute({ reportId: "not-a-uuid", hide: false })).toEqual({ status: "invalid" });
    expect(await decideReviewDispute({ reportId: REPORT, hide: "yes" as unknown as boolean })).toEqual({ status: "invalid" });
    expect(db.calls).toEqual([]);
    expect(next.refresh).not.toHaveBeenCalled();
  });

  it("reads a dispute another admin closed, a refused input, and anything else apart", async () => {
    db.answer = { data: null, error: { message: "dispute_closed", code: "P0002" } };
    expect(await decideReviewDispute({ reportId: REPORT, hide: false })).toEqual({ status: "closed" });
    db.answer = { data: null, error: { message: "bad_reason", code: "22023" } };
    expect(await decideReviewDispute({ reportId: REPORT, hide: false })).toEqual({ status: "invalid" });
    db.answer = { data: null, error: { message: "not_admin", code: "42501" } };
    expect(await decideReviewDispute({ reportId: REPORT, hide: false })).toEqual({ status: "failed" });
    expect(next.refresh).not.toHaveBeenCalled();
  });
});
