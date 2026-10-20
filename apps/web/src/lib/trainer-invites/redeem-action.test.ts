import { beforeEach, describe, expect, it, vi } from "vitest";

// The basic paths are in actions.test.ts; this file covers each answer the screen shows as a status.

vi.mock("server-only", () => ({}));

const next = vi.hoisted(() => ({
  refresh: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn((to: string) => {
    throw new Error(`redirect ${to}`);
  }),
}));
vi.mock("next/cache", () => ({ refresh: next.refresh, revalidatePath: next.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: next.redirect }));

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

const { redeemTrainerInvite } = await import("./redeem-action");

function form(code?: string) {
  const data = new FormData();
  if (code !== undefined) data.set("code", code);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  Object.assign(db, { calls: [], answer: {} });
});

describe("redeemTrainerInvite", () => {
  it.each(["already_trainer", "invite_invalid", "invite_revoked", "invite_redeemed", "invite_expired"])(
    "reloads the screen on %s instead of failing",
    async (message) => {
      db.answer = { error: { message, code: "P0001" } };
      expect(await redeemTrainerInvite({ failed: true }, form("ABCD-EFGH-JKLM"))).toEqual({ failed: false });
      expect(next.refresh).toHaveBeenCalledOnce();
      expect(next.revalidatePath).not.toHaveBeenCalled();
      expect(next.redirect).not.toHaveBeenCalled();
    },
  );

  it("reports a refusal the screen cannot show, such as a signed-out caller", async () => {
    db.answer = { error: { message: "forbidden", code: "42501" } };
    expect(await redeemTrainerInvite({ failed: false }, form("ABCD-EFGH-JKLM"))).toEqual({ failed: true });
    expect(next.refresh).not.toHaveBeenCalled();
    expect(next.redirect).not.toHaveBeenCalled();
  });

  it("sends the code as the database compares it, an empty one included", async () => {
    db.answer = { error: { message: "invite_invalid", code: "P0001" } };
    await redeemTrainerInvite({ failed: false }, form(" ab-cd 23 "));
    await redeemTrainerInvite({ failed: false }, form());
    expect(db.calls).toEqual([
      ["redeem_trainer_invite", { p_code: "ABCD23" }],
      ["redeem_trainer_invite", { p_code: "" }],
    ]);
  });

  it("renders the layout again before it opens the wizard", async () => {
    await expect(redeemTrainerInvite({ failed: false }, form("ABCDEFGHJKLM"))).rejects.toThrow("redirect /onboarding/trainer/profile");
    expect(next.revalidatePath.mock.invocationCallOrder[0]).toBeLessThan(next.redirect.mock.invocationCallOrder[0]);
  });
});
