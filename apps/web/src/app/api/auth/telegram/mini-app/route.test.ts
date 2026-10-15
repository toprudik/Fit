import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const BOT_TOKEN = "123456:TEST-token_for-unit-tests";
const APP_URL = "https://fit.example";
const MAX_AGE = 3600;

vi.mock("server-only", () => ({}));
vi.mock("@/env/client", () => ({ clientEnv: { NEXT_PUBLIC_APP_URL: APP_URL } }));
vi.mock("@/env/server", () => ({ serverEnv: () => ({ TELEGRAM_BOT_TOKEN: BOT_TOKEN, TELEGRAM_INIT_DATA_MAX_AGE: MAX_AGE }) }));

/** Who the session cookie belongs to: the claims getClaims() returns, or null without a session. */
const session = vi.hoisted(() => ({ claims: null as { app_metadata: { telegram_id?: number } } | null }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getClaims: async () => ({ data: session.claims ? { claims: session.claims } : null }) } }),
}));
const signInWithTelegram = vi.hoisted(() => vi.fn(async () => ({ userId: "user-42" })));
vi.mock("@/lib/auth/sign-in-with-telegram", () => ({ signInWithTelegram }));

const { POST } = await import("./route");

const nowSec = () => Math.floor(Date.now() / 1000);

/** initData for Telegram user 42, signed with the bot token as Telegram does, `age` seconds ago. */
function initData(age: number, token = BOT_TOKEN): string {
  const fields = {
    auth_date: String(nowSec() - age),
    user: JSON.stringify({ id: 42, first_name: "Sam", language_code: "ru" }),
  };
  const dataCheckString = Object.entries(fields)
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  const hash = createHmac("sha256", secret).update(dataCheckString).digest("hex");
  return new URLSearchParams({ ...fields, hash }).toString();
}

function post(raw: string) {
  return POST(
    new Request(`${APP_URL}/api/auth/telegram/mini-app`, {
      method: "POST",
      headers: { origin: APP_URL, "sec-fetch-site": "same-origin", "content-type": "application/json", cookie: "dafit-locale=ru" },
      body: JSON.stringify({ initData: raw }),
    }),
  );
}

beforeEach(() => {
  session.claims = null;
  signInWithTelegram.mockClear();
});

describe("POST /api/auth/telegram/mini-app", () => {
  it("starts a session from fresh initData", async () => {
    const res = await post(initData(10));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, fresh: true });
    expect(signInWithTelegram).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ telegramId: 42 }));
  });

  it("accepts initData older than the limit while the same user's session exists, and leaves the session alone", async () => {
    // The Mini App was opened more than an hour ago: every full page load still sends that launch's initData.
    session.claims = { app_metadata: { telegram_id: 42 } };
    const res = await post(initData(MAX_AGE + 600));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, fresh: false });
    expect(signInWithTelegram).not.toHaveBeenCalled();
  });

  it("starts no new session from initData older than the limit", async () => {
    const res = await post(initData(MAX_AGE + 600));

    expect(res.status).toBe(401);
    expect(signInWithTelegram).not.toHaveBeenCalled();
  });

  it("starts no session from old initData over another user's session either", async () => {
    session.claims = { app_metadata: { telegram_id: 43 } };
    const res = await post(initData(MAX_AGE + 600));

    expect(res.status).toBe(401);
    expect(signInWithTelegram).not.toHaveBeenCalled();
  });

  it("rejects initData Telegram did not sign, whatever the session", async () => {
    session.claims = { app_metadata: { telegram_id: 42 } };
    const res = await post(initData(10, "999:other-bot"));

    expect(res.status).toBe(401);
    expect(signInWithTelegram).not.toHaveBeenCalled();
  });
});
