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

const { requestAccess } = await import("./request-access");

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  Object.assign(db, { calls: [], answer: {} });
});

describe("requestAccess", () => {
  it("asks for Pro with the trimmed feature and refreshes", async () => {
    expect(await requestAccess({ plan: "trainer_pro", feature: "  groups  " })).toEqual({ status: "done" });
    expect(db.calls).toEqual([["request_access", { p_plan_code: "trainer_pro", p_feature: "groups" }]]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("asks for Premium without a feature", async () => {
    expect(await requestAccess({ plan: "client_premium" })).toEqual({ status: "done" });
    expect(db.calls).toEqual([["request_access", { p_plan_code: "client_premium", p_feature: undefined }]]);
  });

  it("takes a feature of 64 characters and refuses 65, or an unknown plan, without a call", async () => {
    expect(await requestAccess({ plan: "trainer_pro", feature: "x".repeat(64) })).toEqual({ status: "done" });
    db.calls = [];
    expect(await requestAccess({ plan: "trainer_pro", feature: "x".repeat(65) })).toEqual({ status: "failed" });
    expect(await requestAccess({ plan: "free" })).toEqual({ status: "failed" });
    expect(await requestAccess({ plan: "TRAINER_PRO" })).toEqual({ status: "failed" });
    expect(db.calls).toEqual([]);
  });

  it("tells a signed-out caller apart from other failures", async () => {
    db.answer = { error: { message: "forbidden", code: "42501" } };
    expect(await requestAccess({ plan: "trainer_pro" })).toEqual({ status: "signed-out" });
    db.answer = { error: { message: "permission denied for function", code: "42501" } };
    expect(await requestAccess({ plan: "trainer_pro" })).toEqual({ status: "failed" });
    db.answer = { error: { message: "forbidden", code: "P0001" } };
    expect(await requestAccess({ plan: "trainer_pro" })).toEqual({ status: "failed" });
    expect(next.refresh).not.toHaveBeenCalled();
  });
});
