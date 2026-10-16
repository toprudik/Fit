import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/env/server", () => ({ serverEnv: () => ({ TELEGRAM_BOT_USERNAME: "fitconnection_bot" }) }));

const next = vi.hoisted(() => ({
  refresh: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn((to: string) => {
    throw new Error(`redirect ${to}`);
  }),
}));
vi.mock("next/cache", () => ({ refresh: next.refresh, revalidatePath: next.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: next.redirect }));

/** RPC calls made as the signed-in user, and what the next one answers. */
const db = vi.hoisted(() => ({
  calls: [] as { fn: string; args: Record<string, unknown> }[],
  answer: { data: null as unknown, error: null as { message: string; code: string } | null },
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    rpc: (fn: string, args: Record<string, unknown>) => {
      db.calls.push({ fn, args });
      const result = Promise.resolve(db.answer);
      return Object.assign(result, { single: () => result });
    },
  }),
}));

const { redeemTrainerInvite } = await import("./redeem-action");
const { createTrainerInvite, revokeTrainerInvite } = await import("./admin-actions");

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  db.calls = [];
  db.answer = { data: null, error: null };
});

describe("redeemTrainerInvite", () => {
  it("redeems the normalized code and opens the profile wizard", async () => {
    await expect(redeemTrainerInvite({ failed: false }, form({ code: "abcd-efgh jklm" }))).rejects.toThrow("redirect /onboarding/trainer/profile");
    expect(db.calls).toEqual([{ fn: "redeem_trainer_invite", args: { p_code: "ABCDEFGHJKLM" } }]);
    expect(next.revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("reloads the screen when the invite changed meanwhile, so it shows the new status", async () => {
    db.answer = { data: null, error: { message: "invite_redeemed", code: "P0001" } };
    expect(await redeemTrainerInvite({ failed: false }, form({ code: "ABCD" }))).toEqual({ failed: false });
    expect(next.refresh).toHaveBeenCalledOnce();
    expect(next.redirect).not.toHaveBeenCalled();
  });

  it("reports any other failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    db.answer = { data: null, error: { message: "connection lost", code: "08006" } };
    expect(await redeemTrainerInvite({ failed: false }, form({ code: "ABCD" }))).toEqual({ failed: true });
  });
});

describe("createTrainerInvite", () => {
  it("creates the invite and returns its link and QR once", async () => {
    db.answer = { data: { invite_id: "id-1", code: "ABCDEFGHJKLM", expires_at: "2026-10-30T12:00:00Z" }, error: null };
    const state = await createTrainerInvite({ status: "idle" }, form({ note: " Ivan ", days: "7" }));
    expect(db.calls).toEqual([{ fn: "admin_create_trainer_invite", args: { p_note: "Ivan", p_valid_days: 7 } }]);
    expect(state).toMatchObject({
      status: "created",
      code: "ABCDEFGHJKLM",
      link: "https://t.me/fitconnection_bot?startapp=ti_ABCDEFGHJKLM",
      expiresAt: "2026-10-30T12:00:00Z",
    });
    expect(state.status === "created" && state.qrSvg.startsWith("<svg")).toBe(true);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("refuses a validity outside 1 to 90 days without calling the database", async () => {
    expect(await createTrainerInvite({ status: "idle" }, form({ note: "", days: "91" }))).toEqual({ status: "invalid-days" });
    expect(await createTrainerInvite({ status: "idle" }, form({ note: "", days: "1.5" }))).toEqual({ status: "invalid-days" });
    expect(db.calls).toEqual([]);
  });

  it("reports a refusal, such as a caller who is not an admin", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    db.answer = { data: null, error: { message: "forbidden", code: "42501" } };
    expect(await createTrainerInvite({ status: "idle" }, form({ note: "", days: "14" }))).toEqual({ status: "failed" });
  });
});

describe("revokeTrainerInvite", () => {
  const id = "2b1c7f3e-58a4-4c55-9a52-0d6f2f0b6a11";

  it("revokes the invite and refreshes the list", async () => {
    expect(await revokeTrainerInvite(id)).toEqual({ ok: true });
    expect(db.calls).toEqual([{ fn: "admin_revoke_trainer_invite", args: { p_invite_id: id } }]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("ignores anything that is not an id", async () => {
    expect(await revokeTrainerInvite("1; drop table")).toEqual({ ok: false });
    expect(db.calls).toEqual([]);
  });

  it("refreshes the list when the invite was used or revoked meanwhile", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    db.answer = { data: null, error: { message: "invite_not_revocable", code: "P0001" } };
    expect(await revokeTrainerInvite(id)).toEqual({ ok: false });
    expect(next.refresh).toHaveBeenCalledOnce();
  });
});
