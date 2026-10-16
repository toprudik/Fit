import { NextResponse } from "next/server";
import { z } from "zod";
import { serverEnv } from "@/env/server";
import { negotiateLocale } from "@/i18n/config";
import { deviceCookies, setPreferenceCookies, syncPreferences } from "@/lib/account-preferences";
import { isSameOrigin } from "@/lib/auth/same-origin";
import { signInWithTelegram } from "@/lib/auth/sign-in-with-telegram";
import { readCookie } from "@/lib/preferences";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { assertInitDataFresh, InitDataError, verifyInitData } from "@/lib/telegram/init-data";
import type { TelegramIdentity } from "@/lib/telegram/identity";

const body = z.object({ initData: z.string().min(1).max(4096) });

/**
 * Brings the language, theme and last zone of this device and the account in step (ADR 0015). The
 * answer names the language and theme it set as cookies: on the first launch the language comes
 * from the verified Telegram language_code, then the browser (ADR 0013); later it is the one saved
 * to the account, perhaps on another device. The client reloads when the language differs from the
 * one it was rendered in, and applies the theme at once.
 */
async function respond(
  request: Request,
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  sync: { identity: TelegramIdentity; userId: string; newAccount: boolean; fresh: boolean },
) {
  const cookie = request.headers.get("cookie") ?? "";
  const cookies = await syncPreferences(supabase, {
    userId: sync.userId,
    device: deviceCookies((name) => readCookie(cookie, name)),
    newAccount: sync.newAccount,
    firstLocale: negotiateLocale({ languageCode: sync.identity.languageCode, acceptLanguage: request.headers.get("accept-language") }),
  });
  const response = NextResponse.json({ ok: true, fresh: sync.fresh, locale: cookies.locale, theme: cookies.theme });
  setPreferenceCookies(response, cookies);
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
    const claims = data?.claims;
    if (claims?.app_metadata?.telegram_id === identity.telegramId) {
      return await respond(request, supabase, { identity, userId: claims.sub, newAccount: false, fresh: false });
    }

    assertInitDataFresh(initData, { maxAgeSeconds: env.TELEGRAM_INIT_DATA_MAX_AGE });
    const { userId, newAccount } = await signInWithTelegram(identity);
    // The same client reads the session cookies signInWithTelegram just wrote to this response.
    return await respond(request, supabase, { identity, userId, newAccount, fresh: true });
  } catch (error) {
    if (error instanceof InitDataError) return NextResponse.json({ error: "invalid_init_data" }, { status: 401 });
    console.error("mini-app sign-in failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "sign_in_failed" }, { status: 500 });
  }
}
