import { NextResponse } from "next/server";
import { z } from "zod";
import { serverEnv } from "@/env/server";
import { isSameOrigin } from "@/lib/auth/same-origin";
import { signInWithTelegram } from "@/lib/auth/sign-in-with-telegram";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { InitDataError, verifyInitData } from "@/lib/telegram/init-data";

const body = z.object({ initData: z.string().min(1).max(4096) });

/** Mini App sign-in: the client posts raw initData, the server verifies its HMAC and sets the session. */
export async function POST(request: Request) {
  // CSRF: JSON content type forces a CORS preflight for cross-site callers; Origin must be ours.
  if (!isSameOrigin(request) || !request.headers.get("content-type")?.startsWith("application/json")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const env = serverEnv();
  try {
    const identity = verifyInitData(parsed.data.initData, {
      botToken: env.TELEGRAM_BOT_TOKEN,
      maxAgeSeconds: env.TELEGRAM_INIT_DATA_MAX_AGE,
    });
    // Already signed in as this Telegram user? Skip re-provisioning.
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getClaims();
    if (data?.claims?.app_metadata?.telegram_id === identity.telegramId) return NextResponse.json({ ok: true, fresh: false });

    await signInWithTelegram(identity);
    return NextResponse.json({ ok: true, fresh: true });
  } catch (error) {
    if (error instanceof InitDataError) return NextResponse.json({ error: "invalid_init_data" }, { status: 401 });
    console.error("mini-app sign-in failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "sign_in_failed" }, { status: 500 });
  }
}
