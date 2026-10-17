/**
 * Bot API sendMessage for the notification dispatcher (ADR 0006). Answers are sorted into what the outbox does
 * next; error codes are short and never carry the token, which is part of the request URL.
 */

/** callback_data: a button that acts right in the bot, which passes the tap to POST /api/bot/actions (ADR 0006). */
export type InlineButton = { text: string; web_app: { url: string } } | { text: string; url: string } | { text: string; callback_data: string };

export type OutgoingMessage = {
  chatId: number;
  /** HTML (parse_mode HTML); templates escape every value they insert. */
  text: string;
  /** disable_notification: a reminder in the recipient's quiet hours. */
  silent: boolean;
  buttons: InlineButton[];
};

export type SendResult =
  | { ok: true; messageId: number }
  | {
      ok: false;
      /**
       * chat_unavailable: the bot cannot write to this chat (blocked, never started, deleted account);
       * retry: a temporary fault worth another attempt; rejected: Telegram refuses this message as it is;
       * rate_limited: stop sending for retryAfter seconds; unauthorized: the token itself is wrong.
       */
      kind: "chat_unavailable" | "retry" | "rejected" | "rate_limited" | "unauthorized";
      error: string;
      retryAfter?: number;
    };

type TelegramAnswer = {
  ok?: boolean;
  result?: { message_id?: unknown };
  error_code?: number;
  description?: string;
  parameters?: { retry_after?: number };
};

const CHAT_GONE = /chat not found|user not found|peer_id_invalid|user is deactivated|bot was kicked/i;

/** Sorts a failed Bot API answer. Exported for tests. */
export function classifyFailure(status: number, answer: TelegramAnswer | null): Extract<SendResult, { ok: false }> {
  const code = answer?.error_code ?? status;
  const description = answer?.description ?? "";
  if (code === 429) return { ok: false, kind: "rate_limited", error: "telegram_429", retryAfter: answer?.parameters?.retry_after ?? 5 };
  if (code === 403) return { ok: false, kind: "chat_unavailable", error: "telegram_403" };
  if (code === 401 || code === 404) return { ok: false, kind: "unauthorized", error: `telegram_${code}` };
  if (code === 400 && CHAT_GONE.test(description)) return { ok: false, kind: "chat_unavailable", error: "telegram_400_chat_not_found" };
  // A 400 description names what is wrong with the message ("can't parse entities ..."), never the token.
  if (code === 400) return { ok: false, kind: "rejected", error: `telegram_400: ${description.slice(0, 200)}`.trim() };
  return { ok: false, kind: "retry", error: `telegram_${code}` };
}

export async function sendTelegramMessage(token: string, message: OutgoingMessage, fetchImpl: typeof fetch = fetch): Promise<SendResult> {
  let response: Response;
  try {
    response = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: message.chatId,
        text: message.text,
        parse_mode: "HTML",
        disable_notification: message.silent,
        link_preview_options: { is_disabled: true },
        ...(message.buttons.length > 0 && { reply_markup: { inline_keyboard: message.buttons.map((button) => [button]) } }),
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    // The error message may contain the request URL, and with it the token: keep only the fact.
    return { ok: false, kind: "retry", error: "network_error" };
  }
  const answer = (await response.json().catch(() => null)) as TelegramAnswer | null;
  if (answer?.ok && typeof answer.result?.message_id === "number") return { ok: true, messageId: answer.result.message_id };
  return classifyFailure(response.status, answer);
}
