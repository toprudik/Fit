import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const APP_URL = "https://fit.example";

vi.mock("server-only", () => ({}));
vi.mock("@/env/client", () => ({ clientEnv: { NEXT_PUBLIC_APP_URL: APP_URL } }));
vi.mock("@/env/server", () => ({
  serverEnv: () => ({
    TELEGRAM_BOT_TOKEN: "123456:TEST-token_for-unit-tests",
    TELEGRAM_LOGIN_CLIENT_ID: "123456",
    TELEGRAM_LOGIN_CLIENT_SECRET: "invented-client-secret",
  }),
}));
vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), connection: async () => {} }));

/** What the OIDC exchange and the sign-in did. */
const flow = vi.hoisted(() => ({ exchanges: [] as Record<string, unknown>[], signIns: [] as unknown[], verifyFails: false }));
vi.mock("@/lib/telegram/oidc", async (original) => ({
  ...(await original<typeof import("@/lib/telegram/oidc")>()),
  exchangeCodeForIdToken: async (input: Record<string, unknown>) => {
    flow.exchanges.push(input);
    return "id-token";
  },
  verifyIdToken: async (_token: string, options: { nonce: string }) => {
    if (flow.verifyFails) throw new Error("nonce mismatch");
    return { telegramId: 42, username: null, firstName: "Sam", lastName: null, photoUrl: null, languageCode: null, source: "oidc", options };
  },
}));
vi.mock("@/lib/auth/sign-in-with-telegram", () => ({
  AccountBlockedError: class extends Error {},
  signInWithTelegram: async (identity: unknown) => {
    flow.signIns.push(identity);
    return { userId: "user-42", newAccount: false };
  },
}));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({}) }));
vi.mock("@/lib/account-preferences", () => ({
  deviceCookies: () => ({}),
  syncPreferences: async () => ({}),
  setPreferenceCookies: () => {},
}));

const login = await import("./login/route");
const callback = await import("./callback/route");
const { OIDC_COOKIE } = await import("@/lib/auth/oidc-cookie");

const STATE = "s".repeat(32);
const cookie = (next = "/client") =>
  `${OIDC_COOKIE}=${encodeURIComponent(JSON.stringify({ state: STATE, nonce: "n".repeat(32), codeVerifier: "v".repeat(43), next }))}`;
const back = (query: string, cookieHeader: string | null = cookie()) =>
  callback.GET(new NextRequest(`${APP_URL}/auth/telegram/callback?${query}`, { headers: cookieHeader ? { cookie: cookieHeader } : {} }));

beforeEach(() => {
  flow.exchanges = [];
  flow.signIns = [];
  flow.verifyFails = false;
});

describe("GET /auth/telegram/login", () => {
  const start = (next: string) => login.GET(new NextRequest(`${APP_URL}/auth/telegram/login?next=${encodeURIComponent(next)}`));
  const saved = (response: Response) => {
    const raw = response.headers.getSetCookie().find((c) => c.startsWith(`${OIDC_COOKIE}=`))!;
    return { raw, value: JSON.parse(decodeURIComponent(raw.split(";")[0]!.slice(OIDC_COOKIE.length + 1))) };
  };

  it("sends the browser to Telegram only, with an httpOnly, short-lived cookie scoped to the flow", async () => {
    const response = await start("/client");
    expect(new URL(response.headers.get("location")!).origin).toBe("https://oauth.telegram.org");
    const { raw, value } = saved(response);
    expect(raw).toMatch(/HttpOnly/i);
    expect(raw).toMatch(/Path=\/auth\/telegram/);
    expect(raw).toMatch(/Max-Age=600/);
    expect(raw).toMatch(/SameSite=lax/i);
    expect(value.next).toBe("/client");
  });

  it.each(["https://evil.example/", "//evil.example", "/\\evil.example", "javascript:alert(1)", "/api/cron/privacy", "/auth/sign-out"])(
    "never remembers %j as the way back",
    async (next) => {
      expect(saved(await start(next)).value.next).toBe("/");
    },
  );
});

describe("GET /auth/telegram/callback", () => {
  it("signs in with a matching state and goes back to the saved page on our origin", async () => {
    const response = await back(`code=abc&state=${STATE}`);
    expect(response.headers.get("location")).toBe(`${APP_URL}/client`);
    expect(flow.signIns).toHaveLength(1);
    expect(flow.exchanges[0]).toMatchObject({ code: "abc", codeVerifier: "v".repeat(43), redirectUri: `${APP_URL}/auth/telegram/callback` });
  });

  it("refuses a callback without the flow's cookie (login CSRF)", async () => {
    const response = await back(`code=abc&state=${STATE}`, null);
    expect(response.headers.get("location")).toBe(`${APP_URL}/login?error=expired`);
    expect(flow.exchanges).toEqual([]);
  });

  it.each(["code=abc", `code=abc&state=${"x".repeat(32)}`, `code=abc&state=${STATE.slice(1)}`, `state=${STATE}`])(
    "refuses %j before exchanging the code",
    async (query) => {
      const response = await back(query);
      expect(new URL(response.headers.get("location")!).pathname).toBe("/login");
      expect(flow.exchanges).toEqual([]);
      expect(flow.signIns).toEqual([]);
    },
  );

  it("signs nobody in when the id_token does not verify", async () => {
    flow.verifyFails = true;
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await back(`code=abc&state=${STATE}`);
    expect(response.headers.get("location")).toBe(`${APP_URL}/login?error=failed`);
    expect(flow.signIns).toEqual([]);
  });

  it("never follows a tampered way back off our origin", async () => {
    const response = await back(`code=abc&state=${STATE}`, cookie("https://evil.example/steal"));
    expect(new URL(response.headers.get("location")!).origin).toBe(APP_URL);
  });

  it("clears the flow's cookie whatever happens", async () => {
    for (const response of [await back(`code=abc&state=${STATE}`), await back("code=abc&state=wrong")]) {
      expect(response.headers.getSetCookie().some((c) => c.startsWith(`${OIDC_COOKIE}=;`) || /fit_tg_oidc=;|Max-Age=0|Expires=Thu, 01 Jan 1970/.test(c))).toBe(true);
    }
  });
});
