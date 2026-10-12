import { connection, NextResponse, type NextRequest } from "next/server";
import { clientEnv } from "@/env/client";
import { serverEnv } from "@/env/server";
import { OIDC_COOKIE, oidcCookieOptions, redirectUri, safeNext, type OidcCookie } from "@/lib/auth/oidc-cookie";
import { createAuthorizationRequest } from "@/lib/telegram/oidc";

/** Starts "Log in with Telegram" (OIDC + PKCE) for the website. */
export async function GET(request: NextRequest) {
  await connection(); // always per-request: fresh state/nonce/PKCE, never prerendered
  const req = createAuthorizationRequest({
    clientId: serverEnv().TELEGRAM_LOGIN_CLIENT_ID,
    redirectUri: redirectUri(clientEnv.NEXT_PUBLIC_APP_URL),
  });
  const cookie: OidcCookie = {
    state: req.state,
    nonce: req.nonce,
    codeVerifier: req.codeVerifier,
    next: safeNext(request.nextUrl.searchParams.get("next"), clientEnv.NEXT_PUBLIC_APP_URL),
  };
  const response = NextResponse.redirect(req.url);
  response.cookies.set(OIDC_COOKIE, JSON.stringify(cookie), oidcCookieOptions);
  return response;
}
