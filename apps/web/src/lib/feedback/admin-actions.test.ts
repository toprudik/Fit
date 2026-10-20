import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const next = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/cache", () => ({ refresh: next.refresh }));

const github = vi.hoisted(() => ({
  target: { token: "test-token", repo: "example/repo" } as { token: string; repo: string } | null,
  fileFeedbackIssue: vi.fn(async () => "filed"),
}));
vi.mock("./github", () => ({ feedbackIssueTarget: () => github.target, fileFeedbackIssue: github.fileFeedbackIssue }));

type Answer = { data: unknown; error: { message: string; code: string } | null };

/** Table and RPC calls made as the signed-in user, and what each one answers. */
const db = vi.hoisted(() => ({
  calls: [] as unknown[][],
  answers: [] as Answer[],
  userId: "admin-1" as string | null,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => {
    const next = () => db.answers.shift() ?? { data: null, error: null };
    const query = (table: string) => {
      const steps: unknown[] = [table];
      db.calls.push(steps);
      const chain = { then: (resolve: (value: Answer) => unknown) => resolve(next()) } as Record<string, unknown>;
      for (const step of ["update", "select", "eq", "maybeSingle"]) {
        chain[step] = (...args: unknown[]) => {
          steps.push(step, ...args);
          return chain;
        };
      }
      return chain;
    };
    return {
      auth: { getClaims: async () => ({ data: db.userId ? { claims: { sub: db.userId } } : null }) },
      from: query,
      rpc: (fn: string, args: unknown) => {
        db.calls.push(["rpc", fn, args]);
        return Promise.resolve(next());
      },
    };
  },
}));

const { fileFeedbackIssueNow, replyToFeedback, setFeedbackStatus } = await import("./admin-actions");

const ID = "00000000-0000-4000-8000-000000000001";

beforeEach(() => {
  vi.clearAllMocks();
  github.target = { token: "test-token", repo: "example/repo" };
  github.fileFeedbackIssue.mockResolvedValue("filed");
  Object.assign(db, { calls: [], answers: [], userId: "admin-1" });
});

describe("setFeedbackStatus", () => {
  it.each(["new", "in_progress", "closed"])("moves a message to %s and refreshes", async (status) => {
    db.answers = [{ data: [{ id: ID }], error: null }];
    expect(await setFeedbackStatus({ id: ID, status })).toEqual({ status: "done" });
    expect(db.calls).toEqual([["feedback", "update", { status }, "eq", "id", ID, "select", "id"]]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it.each([
    ["a malformed id", { id: "1", status: "closed" }],
    ["an unknown status", { id: ID, status: "done" }],
  ])("refuses %s without a query", async (_label, raw) => {
    expect(await setFeedbackStatus(raw)).toEqual({ status: "failed" });
    expect(db.calls).toEqual([]);
  });

  it("fails when RLS lets nothing change (not an admin, or the message is gone)", async () => {
    db.answers = [{ data: [], error: null }];
    expect(await setFeedbackStatus({ id: ID, status: "closed" })).toEqual({ status: "failed" });
    expect(next.refresh).not.toHaveBeenCalled();
  });

  it("fails on a database error", async () => {
    db.answers = [{ data: null, error: { code: "42501", message: "permission denied" } }];
    expect(await setFeedbackStatus({ id: ID, status: "closed" })).toEqual({ status: "failed" });
  });
});

describe("fileFeedbackIssueNow", () => {
  it("checks the admin role as the user, then files the issue and refreshes", async () => {
    db.answers = [{ data: { role: "admin" }, error: null }];
    expect(await fileFeedbackIssueNow({ id: ID })).toEqual({ status: "filed" });
    expect(db.calls).toEqual([["user_roles", "select", "role", "eq", "user_id", "admin-1", "eq", "role", "admin", "maybeSingle"]]);
    expect(github.fileFeedbackIssue).toHaveBeenCalledWith(ID);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it.each(["exists", "failed"] as const)("passes on %s from GitHub", async (result) => {
    db.answers = [{ data: { role: "admin" }, error: null }];
    github.fileFeedbackIssue.mockResolvedValue(result);
    expect(await fileFeedbackIssueNow({ id: ID })).toEqual({ status: result });
  });

  it("refuses a malformed id before anything else", async () => {
    expect(await fileFeedbackIssueNow({ id: "abc" })).toEqual({ status: "failed" });
    expect(db.calls).toEqual([]);
    expect(github.fileFeedbackIssue).not.toHaveBeenCalled();
  });

  it("forbids a signed-out visitor", async () => {
    db.userId = null;
    expect(await fileFeedbackIssueNow({ id: ID })).toEqual({ status: "forbidden" });
    expect(github.fileFeedbackIssue).not.toHaveBeenCalled();
  });

  it("forbids a signed-in user who is not an admin", async () => {
    db.answers = [{ data: null, error: null }];
    expect(await fileFeedbackIssueNow({ id: ID })).toEqual({ status: "forbidden" });
    expect(github.fileFeedbackIssue).not.toHaveBeenCalled();
    expect(next.refresh).not.toHaveBeenCalled();
  });

  it("says so when the GitHub token is not set", async () => {
    db.answers = [{ data: { role: "admin" }, error: null }];
    github.target = null;
    expect(await fileFeedbackIssueNow({ id: ID })).toEqual({ status: "disabled" });
    expect(github.fileFeedbackIssue).not.toHaveBeenCalled();
  });
});

describe("replyToFeedback", () => {
  it("sends the trimmed answer through admin_reply_feedback and refreshes", async () => {
    expect(await replyToFeedback({ id: ID, body: "  Спасибо, починили  " })).toEqual({ status: "sent" });
    expect(db.calls).toEqual([["rpc", "admin_reply_feedback", { p_feedback_id: ID, p_body: "Спасибо, починили" }]]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("takes an answer of exactly 2000 characters", async () => {
    expect(await replyToFeedback({ id: ID, body: "a".repeat(2000) })).toEqual({ status: "sent" });
  });

  it.each([
    ["a malformed id", { id: "x", body: "Ок" }],
    ["a blank answer", { id: ID, body: "   " }],
    ["an answer over 2000 characters", { id: ID, body: "a".repeat(2001) }],
  ])("refuses %s without a call", async (_label, raw) => {
    expect(await replyToFeedback(raw)).toEqual({ status: "invalid" });
    expect(db.calls).toEqual([]);
  });

  it("tells a deleted author apart from other failures", async () => {
    db.answers = [{ data: null, error: { code: "P0001", message: "author_deleted" } }];
    expect(await replyToFeedback({ id: ID, body: "Ок" })).toEqual({ status: "author_deleted" });
    db.answers = [{ data: null, error: { code: "42501", message: "not_admin" } }];
    expect(await replyToFeedback({ id: ID, body: "Ок" })).toEqual({ status: "failed" });
    expect(next.refresh).not.toHaveBeenCalled();
  });
});
