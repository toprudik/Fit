import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { clientEnv } from "@/env/client";
import { LOCALE_COOKIE } from "@/i18n/config";
import { routeRequest } from "@/lib/navigation/routing";
import { ZONE_COOKIE } from "@/lib/navigation/zones";
import { preferenceCookieOptions } from "@/lib/preferences";
import { sessionCookieOptions } from "@/lib/supabase/cookie-options";

type CookieToSet = { name: string; value: string; options: Parameters<NextResponse["cookies"]["set"]>[2] };

/**
 * Runs on every page request: refreshes the Supabase session cookie, sends "/" to the last zone,
 * remembers the zone and serves the page in the user's language (see routeRequest).
 */
export async function proxy(request: NextRequest) {
  const decision = routeRequest({
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
    localeCookie: request.cookies.get(LOCALE_COOKIE)?.value,
    zoneCookie: request.cookies.get(ZONE_COOKIE)?.value,
    acceptLanguage: request.headers.get("accept-language"),
    // Browsers without Fetch Metadata (WebKit before 16.4) send no Sec-Fetch-Dest: count those as
    // document loads, so a deep link there still remembers its zone. Telegram Web loads the Mini App
    // in an iframe, whose page loads say "iframe".
    isDocument: ["document", "iframe"].includes(request.headers.get("sec-fetch-dest") ?? "document"),
  });
  if (decision.kind === "redirect") return NextResponse.redirect(new URL(decision.location, request.url));

  const refreshed: CookieToSet[] = [];
  const supabase = createServerClient(clientEnv.NEXT_PUBLIC_SUPABASE_URL, clientEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookieOptions: sessionCookieOptions,
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        // Server code later in this request reads the refreshed session from the request cookies.
        for (const { name, value } of toSet) request.cookies.set(name, value);
        refreshed.push(...toSet);
      },
    },
  });
  // Validates the JWT signature (do not trust getSession() on the server).
  await supabase.auth.getClaims();

  const init = { request: { headers: request.headers } };
  const response =
    decision.kind === "rewrite"
      ? NextResponse.rewrite(new URL(`${decision.pathname}${request.nextUrl.search}`, request.url), init)
      : NextResponse.next(init);
  for (const { name, value, options } of refreshed) response.cookies.set(name, value, options);
  if (decision.kind === "rewrite" && decision.rememberZone) {
    response.cookies.set(ZONE_COOKIE, decision.rememberZone, preferenceCookieOptions);
  }
  return response;
}

export const config = {
  // Everything except build assets, the public files and the auth endpoints that manage the session
  // themselves. Other paths with a dot are pages too, so they get the app's localized 404.
  matcher: ["/((?!_next/static|_next/image|api/auth|auth/telegram|favicon\\.ico$|icon\\.svg$|apple-icon\\.png$|robots\\.txt$).*)"],
};
