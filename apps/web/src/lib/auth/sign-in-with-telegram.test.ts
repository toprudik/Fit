import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TelegramIdentity } from "@/lib/telegram/identity";

vi.mock("server-only", () => ({}));

const USER_ID = "8d0c6f6e-2f7a-4a43-9a4e-4a8f0f6b1c11";

/** The secret-key client: records every profiles upsert, the auth admin calls succeed. */
const admin = vi.hoisted(() => ({
  upserts: [] as { table: string; row: Record<string, unknown>; options: unknown }[],
  upsertError: null as { code: string } | null,
  createError: null as { code: string } | null,
  blockedAt: null as string | null,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    auth: {
      admin: {
        createUser: async () => ({ data: {}, error: admin.createError }),
        generateLink: async () => ({
          data: { user: { id: USER_ID, app_metadata: { telegram_id: 42 } }, properties: { hashed_token: "hashed" } },
          error: null,
        }),
        updateUserById: async () => ({ data: {}, error: null }),
      },
    },
    from: (table: string) => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { blocked_at: admin.blockedAt }, error: null }) }) }),
      upsert: async (row: Record<string, unknown>, options: unknown) => {
        admin.upserts.push({ table, row, options });
        return { error: admin.upsertError };
      },
    }),
  }),
}));
const verifyOtp = vi.hoisted(() => vi.fn(async () => ({ data: {}, error: null })));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({ auth: { verifyOtp } }) }));

const { AccountBlockedError, signInWithTelegram } = await import("./sign-in-with-telegram");

const identity: TelegramIdentity = {
  telegramId: 42,
  username: "sam",
  firstName: "Sam",
  lastName: null,
  photoUrl: "https://t.me/i/userpic/sam.jpg",
  languageCode: "en",
  source: "mini-app",
};

beforeEach(() => {
  admin.upserts = [];
  admin.upsertError = null;
  admin.createError = null;
  admin.blockedAt = null;
  verifyOtp.mockClear();
  vi.useFakeTimers({ now: new Date("2026-10-15T09:30:00.000Z"), toFake: ["Date"] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("signInWithTelegram", () => {
  it("says the account was there already when its email exists", async () => {
    admin.createError = { code: "email_exists" };
    await expect(signInWithTelegram(identity)).resolves.toEqual({ userId: USER_ID, newAccount: false });
  });

  it("writes the profile from Telegram with the sign-in time, clears the blocked-bot mark and nothing else", async () => {
    await expect(signInWithTelegram(identity)).resolves.toEqual({ userId: USER_ID, newAccount: true });

    // user_settings comes from the database trigger on profiles, so profiles is the only table written.
    expect(admin.upserts).toEqual([
      {
        table: "profiles",
        row: {
          id: USER_ID,
          telegram_id: 42,
          username: "sam",
          first_name: "Sam",
          last_name: null,
          photo_url: "https://t.me/i/userpic/sam.jpg",
          language_code: "en",
          last_seen_at: "2026-10-15T09:30:00.000Z",
          bot_blocked_at: null,
        },
        options: { onConflict: "id" },
      },
    ]);
    expect(verifyOtp).toHaveBeenCalledExactlyOnceWith({ type: "magiclink", token_hash: "hashed" });
  });

  it("stops before the session when the profile cannot be written", async () => {
    admin.upsertError = { code: "23514" };

    await expect(signInWithTelegram(identity)).rejects.toThrow("profile upsert failed: 23514");
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("gives a blocked account no session and leaves its profile as it is (ADM-7)", async () => {
    admin.createError = { code: "email_exists" };
    admin.blockedAt = "2026-10-15T09:00:00.000Z";

    await expect(signInWithTelegram(identity)).rejects.toBeInstanceOf(AccountBlockedError);
    expect(admin.upserts).toEqual([]);
    expect(verifyOtp).not.toHaveBeenCalled();
  });
});
