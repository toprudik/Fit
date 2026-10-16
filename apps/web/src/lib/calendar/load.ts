import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { FeedZone } from "./actions";

export type FeedStatus = {
  zone: FeedZone;
  createdAt: string;
  lastAccessedAt: string | null;
};

/**
 * The signed-in user's active feeds, the zones they may have (the trainer zone only with a trainer profile)
 * and their time zone. Null without a session. token_hash is not granted, so the columns are listed.
 */
export async function loadCalendarFeeds(): Promise<{
  zones: FeedZone[];
  feeds: FeedStatus[];
  timeZone: string;
} | null> {
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  const userId = session?.claims.sub;
  if (!userId) return null;

  const [feeds, trainer, settings] = await Promise.all([
    supabase.from("calendar_feeds").select("zone, created_at, last_accessed_at").eq("user_id", userId).is("revoked_at", null),
    supabase.from("trainer_profiles").select("user_id").eq("user_id", userId).maybeSingle(),
    supabase.from("user_settings").select("time_zone").eq("user_id", userId).maybeSingle(),
  ]);
  if (feeds.error) throw new Error(`loading calendar feeds failed: ${feeds.error.code}`);
  if (trainer.error) throw new Error(`loading the trainer profile failed: ${trainer.error.code}`);

  return {
    zones: trainer.data ? ["trainer", "client"] : ["client"],
    feeds: feeds.data.map((feed) => ({
      zone: feed.zone,
      createdAt: feed.created_at,
      lastAccessedAt: feed.last_accessed_at,
    })),
    timeZone: settings.data?.time_zone ?? "Europe/Moscow",
  };
}
