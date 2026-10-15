import type { CookieOptionsWithName } from "@supabase/ssr";
import { cookieAttributes, SECURE_COOKIES } from "@/lib/cookie-attributes";

/**
 * Session cookies are httpOnly: the browser never needs to read the session (all Supabase access
 * goes through the server), so XSS can't steal refresh tokens. In production they are Secure,
 * SameSite=None and Partitioned, so the session holds inside Telegram Web's iframe too
 * (lib/cookie-attributes.ts). @supabase/ssr sets, refreshes and deletes them with these options,
 * here and in src/proxy.ts.
 */
export const sessionCookieOptions: CookieOptionsWithName = {
  httpOnly: true,
  path: "/",
  ...cookieAttributes(SECURE_COOKIES),
};
