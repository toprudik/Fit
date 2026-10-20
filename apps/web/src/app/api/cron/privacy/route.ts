import { NextResponse } from "next/server";
import { serverEnv } from "@/env/server";
import { hasBearer } from "@/lib/auth/bearer";
import { runPrivacyJob } from "@/lib/account/job";
import { type OutgoingMessage, sendTelegramMessage } from "@/lib/notifications/telegram";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** Vercel stops the function after this many seconds; a run stops taking new work well before (BUDGET_MS). */
export const maxDuration = 60;
const BUDGET_MS = 35_000;

/**
 * Privacy work (PRIV-6, PRIV-7): pg_cron calls it through pg_net when an export waits, an archive expired or a
 * deletion is due, with the dispatcher's secret from Supabase Vault. The answer is counts only.
 */
export async function POST(request: Request) {
  const env = serverEnv();
  if (!env.CRON_SECRET) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  if (!hasBearer(request.headers.get("authorization"), env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const send = (message: OutgoingMessage) => sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, message);
    return NextResponse.json(await runPrivacyJob(createSupabaseAdminClient(), BUDGET_MS, send));
  } catch (error) {
    console.error("privacy job failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "privacy_failed" }, { status: 500 });
  }
}
