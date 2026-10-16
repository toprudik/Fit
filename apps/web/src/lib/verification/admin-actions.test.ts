import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const next = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/cache", () => ({ refresh: next.refresh }));

const TRAINER = "11111111-1111-4111-8111-111111111111";

const db = vi.hoisted(() => ({
  calls: [] as { fn: string; args: Record<string, unknown> }[],
  error: null as { message: string; code: string } | null,
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    rpc: async (fn: string, args: Record<string, unknown>) => {
      db.calls.push({ fn, args });
      return { data: null, error: db.error };
    },
  }),
}));

const { decideVerification } = await import("./admin-actions");

beforeEach(() => {
  vi.clearAllMocks();
  db.calls = [];
  db.error = null;
});

describe("decideVerification", () => {
  it("verifies without a reason", async () => {
    expect(await decideVerification({ trainerId: TRAINER, decision: "verified" })).toEqual({ status: "done" });
    expect(db.calls).toEqual([
      { fn: "admin_decide_verification", args: { p_trainer_id: TRAINER, p_decision: "verified", p_reason: undefined } },
    ]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("rejects with the trimmed reason", async () => {
    expect(await decideVerification({ trainerId: TRAINER, decision: "rejected", reason: "  Blurry scan " })).toEqual({ status: "done" });
    expect(db.calls[0]?.args).toEqual({ p_trainer_id: TRAINER, p_decision: "rejected", p_reason: "Blurry scan" });
  });

  it("does not reject without a reason (ADM-5)", async () => {
    expect(await decideVerification({ trainerId: TRAINER, decision: "rejected", reason: "   " })).toEqual({ status: "reason-required" });
    expect(db.calls).toEqual([]);
  });

  it("reloads the queue when another admin decided first", async () => {
    db.error = { message: "verification_not_pending", code: "P0001" };
    expect(await decideVerification({ trainerId: TRAINER, decision: "verified" })).toEqual({ status: "already-decided" });
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("reports any other failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    db.error = { message: "forbidden", code: "42501" };
    expect(await decideVerification({ trainerId: TRAINER, decision: "verified" })).toEqual({ status: "failed" });
  });
});
