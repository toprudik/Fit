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

const { dismissChurn } = await import("./actions");

const PAIR = "00000000-0000-4000-8000-000000000001";

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  Object.assign(db, { calls: [], answer: {} });
});

describe("dismissChurn", () => {
  it("hides the pair from the churn list and refreshes", async () => {
    expect(await dismissChurn(PAIR)).toEqual({ status: "done" });
    expect(db.calls).toEqual([["trainer_dismiss_churn", { p_coaching_id: PAIR }]]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it.each([undefined, null, 42, "pair-1", `${PAIR} `, { id: PAIR }])("refuses %j without a call", async (raw) => {
    expect(await dismissChurn(raw)).toEqual({ status: "invalid" });
    expect(db.calls).toEqual([]);
  });

  it("reports a database error as failed, someone else's pair included", async () => {
    db.answer = { error: { message: "not_your_client", code: "42501" } };
    expect(await dismissChurn(PAIR)).toEqual({ status: "failed" });
    expect(next.refresh).not.toHaveBeenCalled();
  });
});
