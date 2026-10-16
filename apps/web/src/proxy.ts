import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { clientEnv } from "@/env/client";
import { LOCALE_COOKIE } from "@/i18n/config";
import { adminDeniedPath, isAdminPath, routeRequest } from "@/lib/navigation/routing";
import { ZONE_COOKIE } from "@/lib/navigation/zones";
import { preferenceCookieOptions } from "@/lib/preferences";
import { sessionCookieOptions } from "@/lib/supabase/cookie-options";
import type { Database } from "@/lib/supabase/database.types";

/** The admin role, read as the user under RLS (user_roles shows each user their own rows). */
async function isAdmin(supabase: SupabaseClient<Database>, userId: string): Promise<boolean> {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (error) console.error("reading the admin role failed", error.code);
  return data !== null;
}

type CookieToSet = { name: string; value: string; options: Parameters<NextResponse["cookies"]["set"]>[2] };

/**
 * Runs on every page request: refreshes the Supabase session cookie, sends "/" to the last zone,
 * remembers the zone (on the device and the account), keeps the admin section to admins and serves
 * the page in the user's language (see routeRequest).
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
  const supabase = createServerClient<Database>(clientEnv.NEXT_PUBLIC_SUPABASE_URL, clientEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
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
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;

  const init = { request: { headers: request.headers } };
  if (decision.kind === "rewrite" && isAdminPath(request.nextUrl.pathname) && !(userId && (await isAdmin(supabase, userId)))) {
    // A real 404 status, not a page that streams "not found" after a 200 (ADM-12).
    const denied = NextResponse.rewrite(new URL(adminDeniedPath(decision.locale), request.url), { ...init, status: 404 });
    for (const { name, value, options } of refreshed) denied.cookies.set(name, value, options);
    return denied;
  }
  const response =
    decision.kind === "rewrite"
      ? NextResponse.rewrite(new URL(`${decision.pathname}${request.nextUrl.search}`, request.url), init)
      : NextResponse.next(init);
  for (const { name, value, options } of refreshed) response.cookies.set(name, value, options);
  if (decision.kind === "rewrite" && decision.rememberZone) {
    response.cookies.set(ZONE_COOKIE, decision.rememberZone, preferenceCookieOptions);
    // The account keeps it too, so a new device opens the same zone (ADR 0015). Only page loads
    // that switch the zone get here; a failed save leaves the cookie, which is enough on this device.
    if (userId) {
      const { error } = await supabase.from("user_settings").update({ last_zone: decision.rememberZone }).eq("user_id", userId);
      if (error) console.error("saving the last zone failed", error.code);
    }
  }
  return response;
}

export const config = {
  // Everything except build assets, the public files, the auth endpoints that manage the session
  // themselves and the cron routes, which have no session or locale. Other paths with a dot are pages too, so they get the app's localized 404.
  matcher: ["/((?!_next/static|_next/image|api/auth|api/cron|auth/telegram|favicon\\.ico$|icon\\.svg$|apple-icon\\.png$|robots\\.txt$).*)"],
};
