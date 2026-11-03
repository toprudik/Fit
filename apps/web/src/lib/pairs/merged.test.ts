import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const db = vi.hoisted(() => ({
  userId: null as string | null,
  rpc: vi.fn(async () => ({ data: "8a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d", error: null })),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getClaims: async () => ({ data: db.userId ? { claims: { sub: db.userId } } : null }) },
    rpc: db.rpc,
  }),
}));

const { mergedPairId } = await import("./load");

const OLD_PAIR = "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f";

describe("mergedPairId", () => {
  beforeEach(() => db.rpc.mockClear());

  it("does not ask the database without a session, where the function is not granted", async () => {
    db.userId = null;
    await expect(mergedPairId(OLD_PAIR)).resolves.toBeNull();
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("follows the merge for a signed-in user", async () => {
    db.userId = "user-1";
    await expect(mergedPairId(OLD_PAIR)).resolves.toBe("8a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d");
    expect(db.rpc).toHaveBeenCalledWith("merged_pair_id", { p_coaching_id: OLD_PAIR });
  });
});
