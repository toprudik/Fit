import type { Database } from "@/lib/supabase/database.types";
import type { InlineButton, OutgoingMessage, SendResult } from "./telegram";

export type ClaimedRow = Database["public"]["Functions"]["claim_outbox"]["Returns"][number];

/** Arguments of public.record_outbox_result for one row. */
export type RecordedResult =
  | { outcome: "sent"; messageId: number }
  | { outcome: "blocked" | "retry" | "release" | "failed"; error: string; retryAfter?: number };

export type DispatchDeps = {
  claim: (limit: number) => Promise<ClaimedRow[]>;
  record: (id: number, result: RecordedResult) => Promise<void>;
  send: (message: OutgoingMessage) => Promise<SendResult>;
  render: (row: ClaimedRow, options: { group: boolean }) => { text: string; buttons: InlineButton[] } | null;
  /** Telegram chat id of chat_target 'admin_group'; undefined until the team group is configured. */
  adminChatId: number | undefined;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  /** How long one run keeps claiming and sending, ms. Rows still claimed after it go back to the queue. */
  budgetMs: number;
};

export type DispatchSummary = { claimed: number; sent: number; blocked: number; retried: number; failed: number; released: number };

export const BATCH_SIZE = 50;
/** Bot API limits: about 30 messages a second in total and one a second per chat. */
const MIN_GAP_MS = 40;
const SAME_CHAT_GAP_MS = 1100;

/**
 * One dispatcher run (ADR 0006): claims due outbox rows in batches, sends them one by one within the Bot API
 * limits and records each result right after its send, so a run that dies resends as little as possible.
 * A rate limit or a rejected token stops the run and hands the remaining rows back without using an attempt.
 */
export async function dispatchOutbox(deps: DispatchDeps): Promise<DispatchSummary> {
  const summary: DispatchSummary = { claimed: 0, sent: 0, blocked: 0, retried: 0, failed: 0, released: 0 };
  const started = deps.now();
  const lastToChat = new Map<number, number>();
  let lastSend = Number.NEGATIVE_INFINITY;

  const record = async (row: ClaimedRow, result: RecordedResult) => {
    try {
      await deps.record(row.outbox_id, result);
    } catch (error) {
      // The lease runs out and the row is claimed again; nothing personal goes to the log.
      console.error("outbox: recording a result failed", row.outbox_id, error instanceof Error ? error.message : "unknown");
    }
    if (result.outcome === "sent") summary.sent += 1;
    else if (result.outcome === "blocked") summary.blocked += 1;
    else if (result.outcome === "retry") summary.retried += 1;
    else if (result.outcome === "release") summary.released += 1;
    else summary.failed += 1;
  };

  const release = async (rows: ClaimedRow[], error: string, retryAfter = 0) => {
    for (const row of rows) await record(row, { outcome: "release", error, retryAfter });
  };

  while (deps.now() - started < deps.budgetMs) {
    const rows = await deps.claim(BATCH_SIZE);
    summary.claimed += rows.length;

    for (const [index, row] of rows.entries()) {
      if (deps.now() - started >= deps.budgetMs) {
        await release(rows.slice(index), "run_out_of_time");
        return summary;
      }

      const group = row.chat_target !== null;
      const chatId = group ? deps.adminChatId : row.chat_id;
      if (chatId === undefined || chatId === null) {
        await record(row, { outcome: "failed", error: group ? "admin_chat_not_configured" : "no_chat" });
        continue;
      }
      let message: ReturnType<DispatchDeps["render"]>;
      try {
        message = deps.render(row, { group });
      } catch (error) {
        // A payload a template can't read (a malformed date) fails this row alone, not the run and the rows after it.
        console.error("outbox: rendering failed", row.outbox_id, error instanceof Error ? error.name : "unknown");
        await record(row, { outcome: "failed", error: "render_failed" });
        continue;
      }
      if (!message) {
        await record(row, { outcome: "failed", error: "no_template" });
        continue;
      }

      const wait = Math.max(lastSend + MIN_GAP_MS, (lastToChat.get(chatId) ?? Number.NEGATIVE_INFINITY) + SAME_CHAT_GAP_MS) - deps.now();
      if (wait > 0) await deps.sleep(wait);
      const result = await deps.send({ chatId, text: message.text, silent: row.silent, buttons: message.buttons });
      lastSend = deps.now();
      lastToChat.set(chatId, lastSend);

      if (result.ok) {
        await record(row, { outcome: "sent", messageId: result.messageId });
      } else if (result.kind === "rate_limited" || result.kind === "unauthorized") {
        if (result.kind === "unauthorized") console.error("outbox: the Bot API rejected the bot token", result.error);
        await release(rows.slice(index), result.error, result.retryAfter ?? 60);
        return summary;
      } else if (result.kind === "chat_unavailable") {
        // A user who blocked the bot is marked and skipped; a team group the bot is not in is a setup fault.
        await record(row, group ? { outcome: "failed", error: result.error } : { outcome: "blocked", error: result.error });
      } else if (result.kind === "retry") {
        await record(row, { outcome: "retry", error: result.error });
      } else {
        await record(row, { outcome: "failed", error: result.error });
      }
    }

    if (rows.length < BATCH_SIZE) break;
  }
  return summary;
}
