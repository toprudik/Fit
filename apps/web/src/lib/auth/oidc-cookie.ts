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

export const oidcCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/auth/telegram",
  maxAge: OIDC_COOKIE_MAX_AGE,
};

/** Only allow redirects back to our own origin after login (prevents open redirects). */
export function safeNext(value: string | null | undefined, appUrl: string): string {
  const fallback = "/me";
  if (!value) return fallback;
  try {
    const app = new URL(appUrl);
    const target = new URL(value, app);
    return target.origin === app.origin ? `${target.pathname}${target.search}${target.hash}` : fallback;
  } catch {
    return fallback;
  }
}

export const redirectUri = (appUrl: string) => new URL("/auth/telegram/callback", appUrl).toString();
