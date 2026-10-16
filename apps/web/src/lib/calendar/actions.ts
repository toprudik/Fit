"use server";

import { refresh } from "next/cache";
import { clientEnv } from "@/env/client";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { feedUrls } from "./token";

export type FeedZone = "trainer" | "client";

export type CreateFeedResult = { ok: true; urls: ReturnType<typeof feedUrls> } | { ok: false };

/**
 * "Подключить календарь" and "Перевыпустить ссылку" (PRD 2.7-1, 2.7-5): a new token for the zone; the previous
 * feed of that zone stops serving at once (CAL-3). The link goes back to the screen this one time only, the
 * database keeps just its hash (CAL-6).
 */
export async function createCalendarFeed(zone: FeedZone): Promise<CreateFeedResult> {
  if (zone !== "trainer" && zone !== "client") return { ok: false };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_calendar_feed", {
    p_zone: zone,
  });
  if (error || !data) {
    console.error("creating a calendar feed failed", error?.code);
    return { ok: false };
  }
  refresh();
  return { ok: true, urls: feedUrls(clientEnv.NEXT_PUBLIC_APP_URL, data) };
}
