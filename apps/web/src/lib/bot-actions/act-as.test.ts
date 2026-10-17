import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/env/client", () => ({ clientEnv: { NEXT_PUBLIC_SUPABASE_URL: "https://db.example", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "pk" } }));

const state = vi.hoisted(() => ({
  profile: null as null | { id: string; blocked_at: string | null },
  linkUser: { id: "user-1", app_metadata: { telegram_id: 7 } as Record<string, unknown> },
  log: [] as string[],
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.profile, error: null }) }) }) }),
    auth: {
      admin: {
        generateLink: async ({ email }: { email: string }) => {
          state.log.push(`link ${email}`);
          return { data: { user: state.linkUser, properties: { hashed_token: "hash" } }, error: null };
        },
      },
    },
  }),
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      verifyOtp: async ({ token_hash }: { token_hash: string }) => {
        state.log.push(`verify ${token_hash}`);
        return { error: null };
      },
      signOut: async ({ scope }: { scope: string }) => {
        state.log.push(`sign out ${scope}`);
        return { error: null };
      },
    },
  }),
}));

const { asTelegramUser } = await import("./act-as");

beforeEach(() => {
  state.profile = { id: "user-1", blocked_at: null };
  state.linkUser = { id: "user-1", app_metadata: { telegram_id: 7 } };
  state.log = [];
});

describe("asTelegramUser", () => {
  it("runs the work in the user's own session and revokes only that session", async () => {
    expect(await asTelegramUser(7, async (_supabase, userId) => `done ${userId}`)).toBe("done user-1");
    expect(state.log).toEqual(["link tg7@users.fit.invalid", "verify hash", "sign out local"]);
  });

  it("revokes the session when the work throws", async () => {
    await expect(asTelegramUser(7, async () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    expect(state.log.at(-1)).toBe("sign out local");
  });

  it.each([
    ["no account", () => (state.profile = null)],
    ["a blocked account", () => (state.profile = { id: "user-1", blocked_at: "2026-10-17T00:00:00Z" })],
    ["an auth user that is someone else", () => (state.linkUser = { id: "user-2", app_metadata: { telegram_id: 7 } })],
    ["an auth user of another Telegram account", () => (state.linkUser = { id: "user-1", app_metadata: { telegram_id: 8 } })],
  ])("does nothing for %s", async (_name, arrange) => {
    arrange();
    const work = vi.fn();
    expect(await asTelegramUser(7, work)).toBeNull();
    expect(work).not.toHaveBeenCalled();
    expect(state.log.some((entry) => entry.startsWith("verify"))).toBe(false);
  });
});
