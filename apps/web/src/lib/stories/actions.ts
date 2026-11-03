"use server";

import { serverEnv } from "@/env/server";
import { isLocale } from "@/i18n/config";
import { dictionaries } from "@/i18n/dictionaries";
import { isCardId, storyCardFrom } from "@/lib/monthly-report/report";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { storyLink, type StoryLink } from "./link";

/**
 * The link to post with a made story card, read from the card itself (public.story_card()), so it always matches
 * the picture. The locale comes as an argument: a Server Action cannot read it. Null when the card is gone.
 */
export async function loadStoryLink(id: string, locale: string): Promise<StoryLink | null> {
  if (!isCardId(id)) return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("story_card", { p_id: id });
  if (error) {
    console.error("reading a story card link failed", error.code);
    return null;
  }
  const card = storyCardFrom(data);
  if (!card) return null;
  const t = dictionaries[isLocale(locale) ? locale : "ru"];
  return storyLink(card.data.slug, serverEnv().TELEGRAM_BOT_USERNAME, { showcase: t.monthlyReport.card.showcase, app: t.meta.appName });
}
