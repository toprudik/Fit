import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const APP_URL = "https://fit.example";
const BOT_TOKEN = "123456:TEST-token_for-unit-tests";
const CLIENT_ID = "client-id-for-tests";
const CLIENT_SECRET = "client-secret-for-tests";

vi.mock("server-only", () => ({}));
vi.mock("@/env/client", () => ({ clientEnv: { NEXT_PUBLIC_APP_URL: APP_URL } }));
vi.mock("@/env/server", () => ({
  serverEnv: () => ({ TELEGRAM_BOT_TOKEN: BOT_TOKEN, TELEGRAM_LOGIN_CLIENT_ID: CLIENT_ID, TELEGRAM_LOGIN_CLIENT_SECRET: CLIENT_SECRET }),
}));

/** Telegram's side of the flow: the token endpoint and the id_token check. */
const oidc = vi.hoisted(() => ({
  exchangeCodeForIdToken: vi.fn<(input: Record<string, string>) => Promise<string>>(async () => "id-token-for-tests"),
  verifyIdToken: vi.fn<(token: string, options: { audiences: string[]; nonce: string }) => Promise<unknown>>(async () => ({
    telegramId: 4242,
    username: "test_user",
    firstName: "Test",
    lastName: null,
    photoUrl: null,
    languageCode: "en",
    source: "oidc" as const,
  })),
}));
vi.mock("@/lib/telegram/oidc", () => oidc);
const signInWithTelegram = vi.hoisted(() =>
  vi.fn<(identity: unknown) => Promise<{ userId: string; newAccount: boolean }>>(async () => ({ userId: "user-42", newAccount: false })),
);
vi.mock("@/lib/auth/sign-in-with-telegram", () => {
  class AccountBlockedError extends Error {}
  return { AccountBlockedError, signInWithTelegram };
});

const recordSignupSource = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/lib/attribution/record", () => ({ recordSignupSource }));

/** The account's user_settings row (null: the read fails) and the updates written to it after sign-in. */
const account = vi.hoisted(() => ({
  settings: null as Record<string, string> | null,
  updates: [] as Record<string, unknown>[],
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => (account.settings ? { data: account.settings, error: null } : { data: null, error: { code: "XX000" } }),
        }),
      }),
      update: (row: Record<string, unknown>) => ({
        eq: async () => {
          account.updates.push(row);
          return { error: null };
        },
      }),
    }),
  }),
}));

const { GET } = await import("./route");

const STATE = "state-for-unit-tests-0001";
const saved = { state: STATE, nonce: "nonce-for-unit-tests-0001", codeVerifier: "v".repeat(43), next: "/client/sessions" };

function get(search: Record<string, string>, cookie: unknown = saved, deviceCookies = "") {
  const jar = [deviceCookies];
  if (cookie !== null) jar.push(`fit_tg_oidc=${encodeURIComponent(typeof cookie === "string" ? cookie : JSON.stringify(cookie))}`);
  const headers = { cookie: jar.filter(Boolean).join("; ") };
  return GET(new NextRequest(`${APP_URL}/auth/telegram/callback?${new URLSearchParams(search)}`, { headers }));
}

/** Preference cookies the response sets, by name. */
function preferenceCookies(res: Response): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of res.headers.getSetCookie()) {
    const [pair] = line.split(";");
    const [name, value] = pair.split("=");
    if (name.startsWith("dafit-")) out[name] = value;
  }
  return out;
}

/** The OIDC cookie is cleared on every way out: an expired Set-Cookie on its path. */
function expectCookieCleared(res: Response) {
  const header = res.headers.get("set-cookie") ?? "";
  expect(header).toMatch(/fit_tg_oidc=;/);
  expect(header).toMatch(/Path=\/auth\/telegram/);
  expect(header).toMatch(/Expires=Thu, 01 Jan 1970/);
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  account.settings = { locale: "en", theme: "dark", last_zone: "trainer" };
  account.updates = [];
  recordSignupSource.mockClear();
});

describe("GET /auth/telegram/callback", () => {
  it("exchanges the code with the saved verifier, checks the token and signs in", async () => {
    const res = await get({ code: "code-1", state: STATE });

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(`${APP_URL}/client/sessions`);
    expectCookieCleared(res);
    expect(oidc.exchangeCodeForIdToken).toHaveBeenCalledWith({
      code: "code-1",
      codeVerifier: saved.codeVerifier,
      redirectUri: `${APP_URL}/auth/telegram/callback`,
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
    });
    // The bot id (aud per Telegram docs) and the client id, with the nonce sent to Telegram.
    expect(oidc.verifyIdToken).toHaveBeenCalledWith("id-token-for-tests", { audiences: ["123456", CLIENT_ID], nonce: saved.nonce });
    expect(signInWithTelegram).toHaveBeenCalledWith(expect.objectContaining({ telegramId: 4242, source: "oidc" }));
  });

  it("brings an existing account's language, theme and zone to this device", async () => {
    const res = await get({ code: "code-1", state: STATE }, saved, "dafit-locale=ru; dafit-theme=light");

    expect(preferenceCookies(res)).toEqual({ "dafit-locale": "en", "dafit-theme": "dark", "dafit-zone": "trainer" });
    expect(account.updates).toEqual([]);
  });

  it("gives a new account this device's choices and Telegram's language", async () => {
    signInWithTelegram.mockResolvedValueOnce({ userId: "user-43", newAccount: true });
    account.settings = { locale: "ru", theme: "system", last_zone: "client" };
    const res = await get({ code: "code-1", state: STATE }, saved, "dafit-theme=dark");

    expect(account.updates).toEqual([{ locale: "en", theme: "dark" }]);
    expect(preferenceCookies(res)).toEqual({ "dafit-locale": "en", "dafit-zone": "client" });
    expect(recordSignupSource).toHaveBeenCalledWith("user-43", null, "web");
  });

  it("keeps the channel label a new account arrived with and clears it from the browser", async () => {
    signInWithTelegram.mockResolvedValueOnce({ userId: "user-43", newAccount: true });
    const res = await get({ code: "code-1", state: STATE }, saved, "dafit_src=vk.autumn");

    expect(recordSignupSource).toHaveBeenCalledWith("user-43", { source: "vk", campaign: "autumn" }, "web");
    expect(res.headers.getSetCookie().find((line) => line.startsWith("dafit_src="))).toMatch(/Expires=Thu, 01 Jan 1970/);
  });

  it("records no channel for an account that already exists, but still clears the label", async () => {
    const res = await get({ code: "code-1", state: STATE }, saved, "dafit_src=tg");

    expect(recordSignupSource).not.toHaveBeenCalled();
    expect(res.headers.getSetCookie().some((line) => line.startsWith("dafit_src="))).toBe(true);
  });

  it("still signs in when the account settings can't be read", async () => {
    account.settings = null;
    const res = await get({ code: "code-1", state: STATE });

    expect(res.headers.get("location")).toBe(`${APP_URL}/client/sessions`);
    // Only a first language, from Telegram's language_code.
    expect(preferenceCookies(res)).toEqual({ "dafit-locale": "en" });
  });

  it("never follows a saved next that leaves the app", async () => {
    const res = await get({ code: "code-1", state: STATE }, { ...saved, next: "https://evil.example/" });
    expect(res.headers.get("location")).toBe(`${APP_URL}/`);
  });

  it.each([
    ["no cookie", null],
    ["a cookie that is not JSON", "not-json"],
    ["a cookie with a short verifier", { ...saved, codeVerifier: "short" }],
  ])("answers expired for %s", async (_name, cookie) => {
    const res = await get({ code: "code-1", state: STATE }, cookie);

    expect(res.headers.get("location")).toBe(`${APP_URL}/login?error=expired`);
    expectCookieCleared(res);
    expect(oidc.exchangeCodeForIdToken).not.toHaveBeenCalled();
  });

  it("answers denied when the user declined at Telegram", async () => {
    const res = await get({ error: "access_denied", state: STATE });

    expect(res.headers.get("location")).toBe(`${APP_URL}/login?error=denied`);
    expectCookieCleared(res);
    expect(oidc.exchangeCodeForIdToken).not.toHaveBeenCalled();
  });

  it.each([
    ["no code", { state: STATE }],
    ["no state", { code: "code-1" }],
    ["another state", { code: "code-1", state: "state-for-unit-tests-0002" }],
    ["a state of another length", { code: "code-1", state: `${STATE}x` }],
    // As long as the saved state in UTF-16 units, longer in bytes: must not reach timingSafeEqual unequal.
    ["a non-ASCII state of the same length", { code: "code-1", state: "é".repeat(STATE.length) }],
  ])("answers state for %s", async (_name, search) => {
    const res = await get(search);

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(`${APP_URL}/login?error=state`);
    expectCookieCleared(res);
    expect(oidc.exchangeCodeForIdToken).not.toHaveBeenCalled();
  });

  it("answers failed when the token endpoint refuses the code", async () => {
    oidc.exchangeCodeForIdToken.mockRejectedValueOnce(new Error("token endpoint returned 400"));
    const res = await get({ code: "code-1", state: STATE });

    expect(res.headers.get("location")).toBe(`${APP_URL}/login?error=failed`);
    expectCookieCleared(res);
    expect(signInWithTelegram).not.toHaveBeenCalled();
  });

  it("answers failed when the id_token does not verify", async () => {
    oidc.verifyIdToken.mockRejectedValueOnce(new Error("unexpected nonce"));
    const res = await get({ code: "code-1", state: STATE });

    expect(res.headers.get("location")).toBe(`${APP_URL}/login?error=failed`);
    expect(signInWithTelegram).not.toHaveBeenCalled();
  });

  it("answers failed when the sign-in fails and logs no token", async () => {
    signInWithTelegram.mockRejectedValueOnce(new Error("creating the user failed"));
    const res = await get({ code: "code-1", state: STATE });

    expect(res.headers.get("location")).toBe(`${APP_URL}/login?error=failed`);
    expect(preferenceCookies(res)).toEqual({});
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("id-token-for-tests");
  });

  it("answers blocked for an account an admin blocked, without a session", async () => {
    const { AccountBlockedError } = await import("@/lib/auth/sign-in-with-telegram");
    signInWithTelegram.mockRejectedValueOnce(new AccountBlockedError());
    const res = await get({ code: "code-1", state: STATE });

    expect(res.headers.get("location")).toBe(`${APP_URL}/login?error=blocked`);
    expectCookieCleared(res);
    expect(preferenceCookies(res)).toEqual({});
  });
});
