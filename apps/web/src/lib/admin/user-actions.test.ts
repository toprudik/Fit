import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const next = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/cache", () => ({ refresh: next.refresh }));

const USER = "22222222-2222-4222-8222-222222222222";

const db = vi.hoisted(() => ({
  calls: [] as { fn: string; args: Record<string, unknown> }[],
  error: null as { message: string; code: string } | null,
  bans: [] as { userId: string; ban_duration: string }[],
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    rpc: async (fn: string, args: Record<string, unknown>) => {
      db.calls.push({ fn, args });
      return { data: null, error: db.error };
    },
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    auth: {
      admin: {
        updateUserById: async (userId: string, attributes: { ban_duration: string }) => {
          db.bans.push({ userId, ...attributes });
          return { data: {}, error: null };
        },
      },
    },
  }),
}));

const { blockUser, unblockUser } = await import("./user-actions");

beforeEach(() => {
  vi.clearAllMocks();
  db.calls = [];
  db.error = null;
  db.bans = [];
});

describe("blockUser", () => {
  it("blocks with the trimmed reason, then bans the auth user", async () => {
    expect(await blockUser({ userId: USER, reason: "  Spam  " })).toEqual({ status: "done" });
    expect(db.calls).toEqual([{ fn: "admin_block_user", args: { p_user_id: USER, p_reason: "Spam" } }]);
    expect(db.bans).toEqual([{ userId: USER, ban_duration: "876000h" }]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("needs a reason (ADM-7)", async () => {
    expect(await blockUser({ userId: USER, reason: "  " })).toEqual({ status: "reason-required" });
    expect(db.calls).toEqual([]);
  });

  it("bans nobody when the database refuses", async () => {
    db.error = { message: "cannot_block_admin", code: "P0001" };
    expect(await blockUser({ userId: USER, reason: "Spam" })).toEqual({ status: "admin" });
    db.error = { message: "cannot_block_self", code: "P0001" };
    expect(await blockUser({ userId: USER, reason: "Spam" })).toEqual({ status: "self" });
    db.error = { message: "forbidden", code: "42501" };
    expect(await blockUser({ userId: USER, reason: "Spam" })).toEqual({ status: "failed" });
    expect(db.bans).toEqual([]);
  });

  it("reloads the card when the account is blocked already", async () => {
    db.error = { message: "already_blocked", code: "P0001" };
    expect(await blockUser({ userId: USER, reason: "Spam" })).toEqual({ status: "already" });
    expect(next.refresh).toHaveBeenCalledOnce();
  });
});

describe("unblockUser", () => {
  it("lifts the block, then the ban", async () => {
    expect(await unblockUser({ userId: USER, reason: "Appeal" })).toEqual({ status: "done" });
    expect(db.calls).toEqual([{ fn: "admin_unblock_user", args: { p_user_id: USER, p_reason: "Appeal" } }]);
    expect(db.bans).toEqual([{ userId: USER, ban_duration: "none" }]);
  });

  it("says so when another admin lifted it first", async () => {
    db.error = { message: "not_blocked", code: "P0001" };
    expect(await unblockUser({ userId: USER, reason: "Appeal" })).toEqual({ status: "already" });
    expect(db.bans).toEqual([]);
  });
});
