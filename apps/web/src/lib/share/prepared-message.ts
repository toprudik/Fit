import "server-only";

/**
 * Bot API savePreparedInlineMessage (Bot API 8.0): a message the user then sends from the Mini App with
 * WebApp.shareMessage, a card with a picture and an "Открыть" button instead of a bare link (marketing backlog 11).
 * The token is part of the request URL, so failures report only a short code, never the URL.
 */
export type PreparedShare = {
  /** The Telegram user who shares it; only they can send this message. */
  telegramId: number;
  title: string;
  description: string;
  text: string;
  buttonText: string;
  buttonUrl: string;
  thumbnailUrl: string;
};

export async function savePreparedShare(token: string, share: PreparedShare, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  let response: Response;
  try {
    response = await fetchImpl(`https://api.telegram.org/bot${token}/savePreparedInlineMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        user_id: share.telegramId,
        result: {
          type: "article",
          id: "share",
          title: share.title,
          description: share.description,
          thumbnail_url: share.thumbnailUrl,
          input_message_content: { message_text: share.text },
          reply_markup: { inline_keyboard: [[{ text: share.buttonText, url: share.buttonUrl }]] },
        },
        allow_user_chats: true,
        allow_bot_chats: true,
        allow_group_chats: true,
        allow_channel_chats: true,
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    console.error("preparing a share message failed: network_error");
    return null;
  }
  const answer = (await response.json().catch(() => null)) as { ok?: boolean; result?: { id?: unknown }; error_code?: number } | null;
  if (answer?.ok && typeof answer.result?.id === "string") return answer.result.id;
  console.error(`preparing a share message failed: telegram_${answer?.error_code ?? response.status}`);
  return null;
}
