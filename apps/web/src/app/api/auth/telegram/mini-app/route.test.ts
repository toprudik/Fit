import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const BOT_TOKEN = "123456:TEST-token_for-unit-tests";
const APP_URL = "https://fit.example";
const MAX_AGE = 3600;

vi.mock("server-only", () => ({}));
vi.mock("@/env/client", () => ({ clientEnv: { NEXT_PUBLIC_APP_URL: APP_URL } }));
vi.mock("@/env/server", () => ({ serverEnv: () => ({ TELEGRAM_BOT_TOKEN: BOT_TOKEN, TELEGRAM_INIT_DATA_MAX_AGE: MAX_AGE }) }));

/**
 * Who the session cookie belongs to (the claims getClaims() returns, or null without a session), the
 * account's user_settings row (null: the read fails) and the updates written to it.
 */
const session = vi.hoisted(() => ({
  claims: null as { sub: string; app_metadata: { telegram_id?: number } } | null,
  settings: { locale: "ru", theme: "system", last_zone: "client" } as Record<string, string> | null,
  updates: [] as Record<string, unknown>[],
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getClaims: async () => ({ data: session.claims ? { claims: session.claims } : null }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => (session.settings ? { data: session.settings, error: null } : { data: null, error: { code: "XX000" } }),
        }),
      }),
      update: (row: Record<string, unknown>) => ({
        eq: async () => {
          session.updates.push(row);
          return { error: null };
        },
      }),
    }),
  }),
}));
const signInWithTelegram = vi.hoisted(() => vi.fn(async () => ({ userId: "user-42", newAccount: false })));
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

function post(raw: string, cookie = "dafit-locale=ru; dafit-theme=system; dafit-zone=client") {
  return POST(
    new Request(`${APP_URL}/api/auth/telegram/mini-app`, {
      method: "POST",
      headers: { origin: APP_URL, "sec-fetch-site": "same-origin", "content-type": "application/json", cookie },
      body: JSON.stringify({ initData: raw }),
    }),
  );
}

const setCookies = (res: Response) => res.headers.getSetCookie().map((cookie) => cookie.split(";")[0]);

beforeEach(() => {
  session.claims = null;
  session.settings = { locale: "ru", theme: "system", last_zone: "client" };
  session.updates = [];
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
    session.claims = { sub: "user-42", app_metadata: { telegram_id: 42 } };
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
    session.claims = { sub: "user-43", app_metadata: { telegram_id: 43 } };
    const res = await post(initData(MAX_AGE + 600));

    expect(res.status).toBe(401);
    expect(signInWithTelegram).not.toHaveBeenCalled();
  });

  it("rejects initData Telegram did not sign, whatever the session", async () => {
    session.claims = { sub: "user-42", app_metadata: { telegram_id: 42 } };
    const res = await post(initData(10, "999:other-bot"));

    expect(res.status).toBe(401);
    expect(signInWithTelegram).not.toHaveBeenCalled();
  });
});

describe("preferences at sign-in (ADR 0015)", () => {
  it("brings the language and theme saved to the account on another device, and names them for the client", async () => {
    session.claims = { sub: "user-42", app_metadata: { telegram_id: 42 } };
    session.settings = { locale: "en", theme: "light", last_zone: "trainer" };
    const res = await post(initData(MAX_AGE + 600));

    expect(await res.json()).toEqual({ ok: true, fresh: false, locale: "en", theme: "light" });
    // The device keeps the zone it was in last.
    expect(setCookies(res)).toEqual(["dafit-locale=en", "dafit-theme=light"]);
    expect(session.updates).toEqual([]);
  });

  it("gives a new account the device's choices", async () => {
    signInWithTelegram.mockResolvedValueOnce({ userId: "user-42", newAccount: true });
    const res = await post(initData(10), "dafit-locale=en; dafit-theme=dark; dafit-zone=trainer");

    expect(await res.json()).toEqual({ ok: true, fresh: true });
    expect(setCookies(res)).toEqual([]);
    expect(session.updates).toEqual([{ locale: "en", theme: "dark", last_zone: "trainer" }]);
  });

  it("on the first launch takes the language from Telegram when the account can't be read", async () => {
    session.settings = null;
    const res = await post(initData(10), "");

    expect(await res.json()).toEqual({ ok: true, fresh: true, locale: "ru" });
    expect(setCookies(res)).toEqual(["dafit-locale=ru"]);
  });
});
