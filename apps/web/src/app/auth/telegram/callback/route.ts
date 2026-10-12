import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { clientEnv } from "@/env/client";
import { serverEnv } from "@/env/server";
import { signInWithTelegram } from "@/lib/auth/sign-in-with-telegram";
import { OIDC_COOKIE, oidcCookieOptions, parseOidcCookie, redirectUri, safeNext } from "@/lib/auth/oidc-cookie";
import { botIdFromToken } from "@/lib/telegram/identity";
import { exchangeCodeForIdToken, verifyIdToken } from "@/lib/telegram/oidc";

const sameString = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

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
  try {
    const idToken = await exchangeCodeForIdToken({
      code,
      codeVerifier: saved.codeVerifier,
      redirectUri: redirectUri(appUrl),
      clientId: env.TELEGRAM_LOGIN_CLIENT_ID,
      clientSecret: env.TELEGRAM_LOGIN_CLIENT_SECRET,
    });
    const identity = await verifyIdToken(idToken, {
      audiences: [botIdFromToken(env.TELEGRAM_BOT_TOKEN), env.TELEGRAM_LOGIN_CLIENT_ID],
      nonce: saved.nonce,
    });
    await signInWithTelegram(identity);
  } catch (error) {
    console.error("telegram oidc sign-in failed", error instanceof Error ? error.message : "unknown");
    return fail("failed");
  }

  const res = NextResponse.redirect(new URL(safeNext(saved.next, appUrl), appUrl));
  res.cookies.delete({ name: OIDC_COOKIE, path: oidcCookieOptions.path });
  return res;
}
