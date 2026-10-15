import "server-only";
import { z } from "zod";

/** Short-lived, httpOnly cookie holding state/nonce/PKCE verifier between /login and /callback. */
export const OIDC_COOKIE = "fit_tg_oidc";
export const OIDC_COOKIE_MAX_AGE = 600;

const oidcCookie = z.object({
  state: z.string().min(16),
  nonce: z.string().min(16),
  codeVerifier: z.string().min(43),
  next: z.string(),
});
export type OidcCookie = z.infer<typeof oidcCookie>;

export function parseOidcCookie(raw: string | undefined): OidcCookie | null {
  if (!raw) return null;
  try {
    const parsed = oidcCookie.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Lax on purpose, unlike the session cookies (lib/cookie-attributes.ts): the OIDC flow runs only on
 * the website, as a top-level page, and the way back from oauth.telegram.org is a top-level
 * navigation, which carries Lax cookies.
 */
export const oidcCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/auth/telegram",
  maxAge: OIDC_COOKIE_MAX_AGE,
};

/**
 * Route handlers and /login itself. Going on to one of them after a sign-in makes no sense, and inside
 * the Mini App /auth/telegram/login would lead to oauth.telegram.org, which does not load there.
 */
const NOT_AFTER_LOGIN = /^\/(?:auth|api)\/|^\/login(?:\/|$)/;

/**
 * Where to go after login: a page on our own origin (prevents open redirects), never a route handler
 * or /login.
 */
export function safeNext(value: string | null | undefined, appUrl: string): string {
  // "/" opens the last zone (see src/lib/navigation/routing.ts).
  const fallback = "/";
  if (!value) return fallback;
  try {
    const app = new URL(appUrl);
    const target = new URL(value, app);
    if (target.origin !== app.origin) return fallback;
    // Decoded, so /%61uth/… counts as /auth/….
    if (NOT_AFTER_LOGIN.test(decodeURIComponent(target.pathname))) return fallback;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return fallback;
  }
}

export const redirectUri = (appUrl: string) => new URL("/auth/telegram/callback", appUrl).toString();
