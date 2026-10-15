import { NextResponse } from "next/server";
import { z } from "zod";
import { serverEnv } from "@/env/server";
import { isLocale, LOCALE_COOKIE, negotiateLocale } from "@/i18n/config";
import { isSameOrigin } from "@/lib/auth/same-origin";
import { signInWithTelegram } from "@/lib/auth/sign-in-with-telegram";
import { preferenceCookieOptions, readCookie } from "@/lib/preferences";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { assertInitDataFresh, InitDataError, verifyInitData } from "@/lib/telegram/init-data";
import type { TelegramIdentity } from "@/lib/telegram/identity";

const body = z.object({ initData: z.string().min(1).max(4096) });

/**
 * First launch without a saved language: take it from the verified Telegram language_code, then the
 * browser (ADR 0013). The client reloads when it differs from the language it was rendered in.
 */
function respond(request: Request, identity: TelegramIdentity, fresh: boolean) {
  if (isLocale(readCookie(request.headers.get("cookie") ?? "", LOCALE_COOKIE))) return NextResponse.json({ ok: true, fresh });
  const locale = negotiateLocale({ languageCode: identity.languageCode, acceptLanguage: request.headers.get("accept-language") });
  const response = NextResponse.json({ ok: true, fresh, locale });
  response.cookies.set(LOCALE_COOKIE, locale, preferenceCookieOptions);
  return response;
}

/**
 * Mini App sign-in: the client posts raw initData on every page load, the server verifies its HMAC
 * and sets the session. A session needs initData younger than TELEGRAM_INIT_DATA_MAX_AGE only to
 * start: page loads of a Mini App opened earlier send the same, older initData.
 */
export async function POST(request: Request) {
  // CSRF: JSON content type forces a CORS preflight for cross-site callers; Origin must be ours.
  if (!isSameOrigin(request) || !request.headers.get("content-type")?.startsWith("application/json")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const env = serverEnv();
  try {
    const initData = verifyInitData(parsed.data.initData, { botToken: env.TELEGRAM_BOT_TOKEN });
    const { identity } = initData;
    // Already signed in as this Telegram user? Genuine initData of any age confirms it; nothing to do.
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getClaims();
    if (data?.claims?.app_metadata?.telegram_id === identity.telegramId) return respond(request, identity, false);

    assertInitDataFresh(initData, { maxAgeSeconds: env.TELEGRAM_INIT_DATA_MAX_AGE });
    await signInWithTelegram(identity);
    return respond(request, identity, true);
  } catch (error) {
    if (error instanceof InitDataError) return NextResponse.json({ error: "invalid_init_data" }, { status: 401 });
    console.error("mini-app sign-in failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "sign_in_failed" }, { status: 500 });
  }
}
