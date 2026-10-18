import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const db = vi.hoisted(() => ({ answer: { data: true as unknown, error: null as null | { code: string } }, calls: [] as unknown[] }));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    rpc: async (fn: string, args: unknown) => {
      db.calls.push({ fn, args });
      return db.answer;
    },
  }),
}));

const { RATE_LIMITS, withinRateLimit } = await import("./rate-limit");

beforeEach(() => {
  db.answer = { data: true, error: null };
  db.calls = [];
});

describe("withinRateLimit", () => {
  it("counts the hit in the database with the limit's bucket and window", async () => {
    expect(await withinRateLimit(RATE_LIMITS.botAction, "7")).toBe(true);
    expect(db.calls).toEqual([
      { fn: "rate_limit_hit", args: { p_bucket: "bot:action", p_subject: "7", p_limit: 30, p_window_seconds: 60 } },
    ]);
  });

  it("refuses when the database says the limit is reached", async () => {
    db.answer = { data: false, error: null };
    expect(await withinRateLimit(RATE_LIMITS.miniAppSignIn, "42")).toBe(false);
  });

  it("lets the request through when the database can't answer", async () => {
    db.answer = { data: null, error: { code: "PGRST202" } };
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await withinRateLimit(RATE_LIMITS.miniAppSignIn, "42")).toBe(true);
    expect(errors).toHaveBeenCalledWith("checking a rate limit failed", "PGRST202");
  });

  it("keeps windows the database accepts (1 s to 1 day)", () => {
    for (const limit of Object.values(RATE_LIMITS)) {
      expect(limit.windowSeconds).toBeGreaterThanOrEqual(1);
      expect(limit.windowSeconds).toBeLessThanOrEqual(86400);
      expect(limit.bucket.length).toBeLessThanOrEqual(64);
    }
  });
});
