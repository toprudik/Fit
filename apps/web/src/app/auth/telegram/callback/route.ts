import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { clientEnv } from "@/env/client";
import { serverEnv } from "@/env/server";
import { negotiateLocale } from "@/i18n/config";
import { deviceCookies, setPreferenceCookies, syncPreferences } from "@/lib/account-preferences";
import { AccountBlockedError, signInWithTelegram } from "@/lib/auth/sign-in-with-telegram";
import { OIDC_COOKIE, oidcCookieOptions, parseOidcCookie, redirectUri, safeNext } from "@/lib/auth/oidc-cookie";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { botIdFromToken, type TelegramIdentity } from "@/lib/telegram/identity";
import { exchangeCodeForIdToken, verifyIdToken } from "@/lib/telegram/oidc";

/** Compares bytes, not UTF-16 units: timingSafeEqual throws on buffers of different byte lengths. */
function sameString(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Completes Telegram OIDC: checks state, exchanges the code (PKCE), verifies the id_token, signs in. */
export async function GET(request: NextRequest) {
  const appUrl = clientEnv.NEXT_PUBLIC_APP_URL;
  const fail = (reason: string) => {
    const res = NextResponse.redirect(new URL(`/login?error=${reason}`, appUrl));
    res.cookies.delete({ name: OIDC_COOKIE, path: oidcCookieOptions.path });
    return res;
  };

  const saved = parseOidcCookie(request.cookies.get(OIDC_COOKIE)?.value);
  if (!saved) return fail("expired");

  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const state = params.get("state");
  if (params.get("error")) return fail("denied");
  if (!code || !state || !sameString(state, saved.state)) return fail("state");

  const env = serverEnv();
  let identity: TelegramIdentity;
  let signedIn: { userId: string; newAccount: boolean };
  try {
    const idToken = await exchangeCodeForIdToken({
      code,
      codeVerifier: saved.codeVerifier,
      redirectUri: redirectUri(appUrl),
      clientId: env.TELEGRAM_LOGIN_CLIENT_ID,
      clientSecret: env.TELEGRAM_LOGIN_CLIENT_SECRET,
    });
    identity = await verifyIdToken(idToken, {
      audiences: [botIdFromToken(env.TELEGRAM_BOT_TOKEN), env.TELEGRAM_LOGIN_CLIENT_ID],
      nonce: saved.nonce,
    });
    signedIn = await signInWithTelegram(identity);
  } catch (error) {
    if (error instanceof AccountBlockedError) return fail("blocked");
    console.error("telegram oidc sign-in failed", error instanceof Error ? error.message : "unknown");
    return fail("failed");
  }

  const res = NextResponse.redirect(new URL(safeNext(saved.next, appUrl), appUrl));
  res.cookies.delete({ name: OIDC_COOKIE, path: oidcCookieOptions.path });
  // Language, theme and last zone: a new account keeps this device's, an existing one brings its own
  // (ADR 0015). A language the device never saved comes from Telegram, then the browser (ADR 0013).
  const cookies = await syncPreferences(await createSupabaseServerClient(), {
    ...signedIn,
    device: deviceCookies((name) => request.cookies.get(name)?.value),
    firstLocale: negotiateLocale({ languageCode: identity.languageCode, acceptLanguage: request.headers.get("accept-language") }),
  });
  setPreferenceCookies(res, cookies);
  return res;
}
