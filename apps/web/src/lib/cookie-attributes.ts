/**
 * SameSite, Secure and Partitioned for the app's own cookies: the Supabase session
 * (lib/supabase/cookie-options.ts) and the device preferences (lib/preferences.ts). Every place that
 * sets, refreshes or deletes one of them uses these, because a partitioned cookie can only be replaced
 * or deleted by a Set-Cookie that is partitioned too.
 *
 * Telegram Web (web.telegram.org) runs the Mini App in an iframe, where the app is a third party.
 * Browsers neither store nor send SameSite=Lax cookies there, so in production the cookies are
 * SameSite=None, which needs Secure, and Partitioned (CHIPS): the browser keeps them in a jar of their
 * own for each top-level site, also where third-party cookies are blocked. Over plain http in
 * development they stay Lax. Why that is safe against CSRF: ADR 0004.
 */
export function cookieAttributes(secure: boolean) {
  return secure ? ({ sameSite: "none", secure: true, partitioned: true } as const) : ({ sameSite: "lax", secure: false } as const);
}

/** The same attributes for a document.cookie string. */
export function cookieAttributesString(secure: boolean): string {
  return secure ? "SameSite=None; Secure; Partitioned" : "SameSite=Lax";
}

/** Production builds are served over https only (ADR 0002); `next dev` runs on plain http. */
export const SECURE_COOKIES = process.env.NODE_ENV === "production";
