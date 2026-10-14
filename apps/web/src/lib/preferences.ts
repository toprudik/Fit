/**
 * Device-level interface preferences (language, theme, last zone) live in plain cookies so the
 * proxy and the pre-paint script can read them. They hold no personal data. Once user_settings
 * exists (docs/architecture/data-model.md) the server will also persist them per account.
 */
export const PREFERENCE_MAX_AGE = 60 * 60 * 24 * 365;

export const preferenceCookieOptions = {
  path: "/",
  maxAge: PREFERENCE_MAX_AGE,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  httpOnly: false,
};

/** document.cookie string for a preference set in the browser. */
export function preferenceCookie(name: string, value: string, secure = typeof location !== "undefined" && location.protocol === "https:") {
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${PREFERENCE_MAX_AGE}; SameSite=Lax${secure ? "; Secure" : ""}`;
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
