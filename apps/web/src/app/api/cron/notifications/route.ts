import { NextResponse } from "next/server";
import { clientEnv } from "@/env/client";
import { serverEnv } from "@/env/server";
import { hasBearer } from "@/lib/auth/bearer";
import { dispatchOutbox, type RecordedResult } from "@/lib/notifications/dispatch";
import { renderMessage } from "@/lib/notifications/messages";
import { sendTelegramMessage } from "@/lib/notifications/telegram";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** Vercel stops the function after this many seconds; a run stops claiming well before (BUDGET_MS). */
export const maxDuration = 60;
const BUDGET_MS = 40_000;

/**
 * Notification dispatcher (ADR 0006). Supabase pg_cron calls it every minute through pg_net when outbox rows
 * are due; the URL and the secret live in Supabase Vault. It claims due rows, sends them through the Bot API
 * and records each result. The answer is a count summary only, never message content.
 */
export async function POST(request: Request) {
  const env = serverEnv();
  if (!env.CRON_SECRET) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  if (!hasBearer(request.headers.get("authorization"), env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  try {
    const summary = await dispatchOutbox({
      claim: async (limit) => {
        const { data, error } = await admin.rpc("claim_outbox", { p_limit: limit });
        if (error) throw new Error(`claim_outbox failed: ${error.code}`);
        return data;
      },
      record: async (id, result: RecordedResult) => {
        const { error } = await admin.rpc(
          "record_outbox_result",
          result.outcome === "sent"
            ? { p_id: id, p_outcome: "sent", p_telegram_message_id: result.messageId }
            : { p_id: id, p_outcome: result.outcome, p_error: result.error, p_retry_after_s: result.retryAfter },
        );
        if (error) throw new Error(`record_outbox_result failed: ${error.code}`);
      },
      send: (message) => sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, message),
      render: (row, { group }) => renderMessage(row, { appUrl: clientEnv.NEXT_PUBLIC_APP_URL, group }),
      adminChatId: env.TELEGRAM_ADMIN_CHAT_ID,
      now: () => Date.now(),
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      budgetMs: BUDGET_MS,
    });
    return NextResponse.json(summary);
  } catch (error) {
    console.error("notification dispatch failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "dispatch_failed" }, { status: 500 });
  }
}
