import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { OIDC_COOKIE, parseOidcCookie } from "@/lib/auth/oidc-cookie";

const APP_URL = "https://fit.example";
const CLIENT_ID = "client-id-for-tests";

vi.mock("server-only", () => ({}));
vi.mock("@/env/client", () => ({ clientEnv: { NEXT_PUBLIC_APP_URL: APP_URL } }));
vi.mock("@/env/server", () => ({ serverEnv: () => ({ TELEGRAM_LOGIN_CLIENT_ID: CLIENT_ID }) }));
/** connection() needs Next's request scope, which a unit test does not have; the route must still wait for it. */
const connection = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), connection }));

const { GET } = await import("./route");

const get = (search = "") => GET(new NextRequest(`${APP_URL}/auth/telegram/login${search}`));

/** The OIDC cookie the response sets, parsed as the callback parses it. */
function savedCookie(res: Response) {
  const header = res.headers.get("set-cookie") ?? "";
  const value = /fit_tg_oidc=([^;]*)/.exec(header)?.[1];
  return { header, cookie: parseOidcCookie(value === undefined ? undefined : decodeURIComponent(value)) };
}

describe("GET /auth/telegram/login", () => {
  it("redirects to Telegram with PKCE and keeps state, nonce and verifier in the cookie", async () => {
    const res = await get();
    const target = new URL(res.headers.get("location") ?? "");
    const { header, cookie } = savedCookie(res);

    expect(res.status).toBe(307);
    expect(connection).toHaveBeenCalled();
    expect(target.origin + target.pathname).toBe("https://oauth.telegram.org/auth");
    expect(Object.fromEntries(target.searchParams)).toMatchObject({
      client_id: CLIENT_ID,
      redirect_uri: `${APP_URL}/auth/telegram/callback`,
      response_type: "code",
      scope: "openid profile",
      code_challenge_method: "S256",
    });
    expect(cookie).not.toBeNull();
    expect(target.searchParams.get("state")).toBe(cookie?.state);
    expect(target.searchParams.get("nonce")).toBe(cookie?.nonce);
    // The verifier itself never leaves the server; only its hash goes to Telegram.
    expect(target.searchParams.get("code_challenge")).not.toBe(cookie?.codeVerifier);
    expect(res.headers.get("location")).not.toContain(cookie?.codeVerifier);
    expect(header).toContain(`${OIDC_COOKIE}=`);
    expect(header).toMatch(/HttpOnly/i);
    expect(header).toMatch(/SameSite=lax/i);
    expect(header).toMatch(/Path=\/auth\/telegram/);
    expect(header).toMatch(/Max-Age=600/);
  });

  it("makes fresh state, nonce and verifier on every request", async () => {
    const first = savedCookie(await get()).cookie;
    const second = savedCookie(await get()).cookie;

    expect(first?.state).not.toBe(second?.state);
    expect(first?.nonce).not.toBe(second?.nonce);
    expect(first?.codeVerifier).not.toBe(second?.codeVerifier);
  });

  it("remembers a page of the app to open after the sign-in", async () => {
    const { cookie } = savedCookie(await get(`?next=${encodeURIComponent("/client/sessions?tab=past")}`));
    expect(cookie?.next).toBe("/client/sessions?tab=past");
  });

  it.each(["https://evil.example/phish", "//evil.example", "/api/settings/time-zone", "/auth/telegram/login", "/login", "/%61uth/sign-out"])(
    "falls back to / for next=%s",
    async (next) => {
      const { cookie } = savedCookie(await get(`?next=${encodeURIComponent(next)}`));
      expect(cookie?.next).toBe("/");
    },
  );
});
