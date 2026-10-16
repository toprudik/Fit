import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { clientEnv } from "@/env/client";
import { LOCALE_COOKIE } from "@/i18n/config";
import { BETA_TERMS_VERSION, CONSENT_COOKIE, consentCookieOptions, consentCookieValue } from "@/lib/consent/beta-terms";
import { adminDeniedPath, consentRedirect, isAdminPath, routeRequest, trainerZoneRedirect } from "@/lib/navigation/routing";
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

/** Whether the user has a trainer profile, which is what opens the trainer zone (read as the user under RLS). */
async function isTrainer(supabase: SupabaseClient<Database>, userId: string): Promise<boolean> {
  const { data, error } = await supabase.from("trainer_profiles").select("user_id").eq("user_id", userId).maybeSingle();
  // Unreadable is not a reason to lock a trainer out of their zone: the page reads its own data under RLS.
  if (error) {
    console.error("reading the trainer profile failed", error.code);
    return true;
  }
  return data !== null;
}

/** Whether the user accepted the beta terms in force and has not revoked them, read as the user under RLS. */
async function acceptedBetaTerms(supabase: SupabaseClient<Database>, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("consents")
    .select("id")
    .eq("user_id", userId)
    .eq("kind", "beta_terms")
    .eq("version", BETA_TERMS_VERSION)
    .is("revoked_at", null)
    .limit(1)
    .maybeSingle();
  // Unreadable is not accepted: the terms screen says so and lets the user try again.
  if (error) console.error("reading the beta terms consent failed", error.code);
  return data !== null;
}

type CookieToSet = { name: string; value: string; options: Parameters<NextResponse["cookies"]["set"]>[2] };

/**
 * Runs on every page request: refreshes the Supabase session cookie, sends "/" to the last zone,
 * keeps signed-in users on the beta terms until they accept them (AUTH-4), remembers the zone (on the
 * device and the account), keeps the trainer zone to trainers and the admin section to admins and serves
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
  // The beta terms come before any other screen, also one a link opened (PRD wave-1 §2.1 rules 3, 5). The
  // cookie spares the database once this device saw the acceptance; it names the user and the version.
  let consentCookie: string | null = null;
  const toConsent = decision.kind === "rewrite" ? consentRedirect(request.nextUrl.pathname, request.nextUrl.search) : null;
  if (userId && toConsent && request.cookies.get(CONSENT_COOKIE)?.value !== consentCookieValue(userId)) {
    if (!(await acceptedBetaTerms(supabase, userId))) {
      const redirect = NextResponse.redirect(new URL(toConsent, request.url));
      for (const { name, value, options } of refreshed) redirect.cookies.set(name, value, options);
      return redirect;
    }
    consentCookie = consentCookieValue(userId);
  }
  // Only trainers have the trainer zone (PAIR-3): anyone else signed in who opens it, from "/" with an old zone
  // cookie or from a link, lands in the client zone. Signed-out visitors see the zone's screens as before.
  const toClientZone = decision.kind === "rewrite" ? trainerZoneRedirect(request.nextUrl.pathname) : null;
  if (userId && toClientZone && !(await isTrainer(supabase, userId))) {
    const redirect = NextResponse.redirect(new URL(toClientZone, request.url));
    for (const { name, value, options } of refreshed) redirect.cookies.set(name, value, options);
    if (consentCookie) redirect.cookies.set(CONSENT_COOKIE, consentCookie, consentCookieOptions);
    return redirect;
  }
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
  if (consentCookie) response.cookies.set(CONSENT_COOKIE, consentCookie, consentCookieOptions);
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
  matcher: ["/((?!_next/static|_next/image|api/auth|api/cron|api/calendar|auth/telegram|favicon\\.ico$|icon\\.svg$|apple-icon\\.png$|robots\\.txt$).*)"],
};
