import type { CookieOptionsWithName } from "@supabase/ssr";

/**
 * Session cookies are httpOnly + Secure in production: the browser never needs to read the session
 * (all Supabase access goes through the server), so XSS can't steal refresh tokens.
 */
export const sessionCookieOptions: CookieOptionsWithName = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
};
