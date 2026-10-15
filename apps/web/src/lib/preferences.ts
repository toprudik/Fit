import type { Locale } from "@/i18n/config";
import type { Zone } from "@/lib/navigation/zones";
import type { ThemePreference } from "@/lib/theme/theme";
import { cookieAttributes, cookieAttributesString, SECURE_COOKIES } from "./cookie-attributes";

/**
 * Interface preferences (language, theme, last zone) live in plain cookies so the proxy and the
 * pre-paint script can read them. They hold no personal data. The server also saves each choice to
 * the account (user_settings), and sign-in brings the account's choices to the device (ADR 0015).
 * The server and the browser write the cookies with the same attributes (lib/cookie-attributes.ts).
 */
export type Preferences = { locale: Locale; theme: ThemePreference; lastZone: Zone };

/** Route handler that saves preferences to the signed-in user's account. */
export const PREFERENCES_ENDPOINT = "/api/settings/preferences";

/**
 * Saves choices to the account. Never throws: signed out, offline or slow, the cookie the caller
 * already wrote keeps the choice on this device. keepalive lets it finish while the page unloads.
 */
export async function saveAccountPreferences(patch: Partial<Preferences>, timeoutMs = 5000): Promise<void> {
  try {
    await fetch(PREFERENCES_ENDPOINT, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
      keepalive: true,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    // The cookie still holds the choice on this device.
  }
}

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
