import { NextResponse } from "next/server";
import { serverEnv } from "@/env/server";
import { hasBearer } from "@/lib/auth/bearer";
import { fetchNewSentryIssues, postErrorAlerts } from "@/lib/monitoring/alerts";
import { sendTelegramMessage } from "@/lib/notifications/telegram";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 30;

/**
 * Error alerts in the team chat (ADR 0017): pg_cron calls it every five minutes through pg_net, with the
 * dispatcher's secret from Supabase Vault. It posts each new Sentry issue once to TELEGRAM_ADMIN_CHAT_ID and does
 * nothing until SENTRY_API_TOKEN, SENTRY_ORG and the chat are set. The answer is counts only.
 */
export async function POST(request: Request) {
  const env = serverEnv();
  if (!env.CRON_SECRET) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  if (!hasBearer(request.headers.get("authorization"), env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { SENTRY_API_TOKEN: token, SENTRY_ORG: org, TELEGRAM_ADMIN_CHAT_ID: chatId } = env;
  if (!token || !org || chatId === undefined) return NextResponse.json({ skipped: "not_configured" });

  const admin = createSupabaseAdminClient();
  try {
    const summary = await postErrorAlerts({
      fetchIssues: () => fetchNewSentryIssues(org, token),
      claim: async (ids) => {
        const { data, error } = await admin.rpc("claim_error_alerts", { p_issue_ids: ids });
        if (error) throw new Error(`claim_error_alerts failed: ${error.code}`);
        return data ?? [];
      },
      send: (message) => sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, message),
      chatId,
    });
    return NextResponse.json(summary);
  } catch (error) {
    console.error("error alerts failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "alerts_failed" }, { status: 500 });
  }
}
