import { cookieAttributes, cookieAttributesString, SECURE_COOKIES } from "./cookie-attributes";

/**
 * Device-level interface preferences (language, theme, last zone) live in plain cookies so the
 * proxy and the pre-paint script can read them. They hold no personal data. Once user_settings
 * exists (docs/architecture/data-model.md) the server will also persist them per account.
 * The server and the browser write them with the same attributes (lib/cookie-attributes.ts).
 */
export const PREFERENCE_MAX_AGE = 60 * 60 * 24 * 365;

export const preferenceCookieOptions = {
  path: "/",
  maxAge: PREFERENCE_MAX_AGE,
  httpOnly: false,
  ...cookieAttributes(SECURE_COOKIES),
};

/** document.cookie string for a preference set in the browser. */
export function preferenceCookie(name: string, value: string, secure = SECURE_COOKIES) {
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${PREFERENCE_MAX_AGE}; ${cookieAttributesString(secure)}`;
}

/** Reads one cookie from a document.cookie-style string. */
export function readCookie(cookieString: string, name: string): string | null {
  for (const part of cookieString.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) {
      try {
        return decodeURIComponent(rest.join("="));
      } catch {
        return null;
      }
    }
  }
  return null;
}
