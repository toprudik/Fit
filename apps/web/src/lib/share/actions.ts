"use server";

import { clientEnv } from "@/env/client";
import { serverEnv } from "@/env/server";
import { getDictionary } from "@/i18n/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { savePreparedShare } from "./prepared-message";
import { shareTarget } from "./target";

const MAX_TEXT = 1000;

/**
 * Prepares the Telegram message for "Поделиться" in the Mini App (marketing backlog 11) and answers its id for
 * shareMessage, or null when the link is not one of ours, the caller has no Telegram account or Telegram refused.
 * The sender is the signed-in user from the session, never an id the client sends.
 */
export async function prepareShareMessage(link: string, text: string): Promise<string | null> {
  const env = serverEnv();
  const target = shareTarget(link, clientEnv.NEXT_PUBLIC_APP_URL, env.TELEGRAM_BOT_USERNAME);
  const message = text.trim().slice(0, MAX_TEXT);
  if (!target || !message) return null;

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const telegramId = (data?.claims.app_metadata as { telegram_id?: unknown } | undefined)?.telegram_id;
  if (typeof telegramId !== "number") return null;

  const copy = (await getDictionary()).share;
  return savePreparedShare(env.TELEGRAM_BOT_TOKEN, {
    telegramId,
    title: copy.titles[target.kind],
    description: message,
    text: `${message}\n${link}`,
    buttonText: copy.open,
    buttonUrl: target.telegram,
    thumbnailUrl: new URL("/apple-icon.png", clientEnv.NEXT_PUBLIC_APP_URL).toString(),
  });
}
