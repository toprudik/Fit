import "server-only";
import type { Locale } from "@/i18n/config";
import { dictionaries } from "@/i18n/dictionaries";
import { asTelegramUser } from "./act-as";
import { parseBotAction } from "./callback-data";

/**
 * What the bot shows after a tap: notice in the popup Telegram shows on the button; when resolved, the bot drops
 * the action buttons from the message and appends line, so the chat shows how the request ended.
 */
export type BotActionAnswer = { notice: string; resolved: boolean; line?: string };

/** The language of the Telegram client, for an answer to someone without a DaFit account (AUTH-2 rule). */
function telegramLocale(languageCode: string | null): Locale {
  return languageCode?.toLowerCase().startsWith("en") ? "en" : "ru";
}

/** Handles a tap on an action button (PRD §3 Т2). Answers in the user's DaFit language. */
export async function answerBotAction(input: { telegramId: number; data: string; languageCode: string | null }): Promise<BotActionAnswer> {
  const fallback = dictionaries[telegramLocale(input.languageCode)].botActions;
  const action = parseBotAction(input.data);
  if (!action) return { notice: fallback.failed, resolved: false };

  const answer = await asTelegramUser(input.telegramId, async (supabase, userId) => {
    const { data: settings } = await supabase.from("user_settings").select("locale").eq("user_id", userId).maybeSingle();
    const t = dictionaries[settings?.locale ?? telegramLocale(input.languageCode)].botActions;
    const { error } = await supabase.rpc("decide_booking", { p_booking_id: action.bookingId, p_accept: action.accept });
    if (!error) {
      return action.accept
        ? { notice: t.bookingConfirmed, resolved: true, line: t.bookingConfirmedLine }
        : { notice: t.bookingDeclined, resolved: true, line: t.bookingDeclinedLine };
    }
    // Already answered, taken back, expired or started, or not this user's to answer: the request is closed for them.
    if (error.message === "request_not_found") return { notice: t.requestClosed, resolved: true, line: t.requestClosedLine };
    console.error("bot action failed", error.code);
    return { notice: t.failed, resolved: false };
  });
  return answer ?? { notice: fallback.noAccount, resolved: false };
}
