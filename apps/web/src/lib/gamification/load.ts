import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isBadgeCode, toStreaks, type EarnedBadge, type Streaks } from "./gamification";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The badges of a user the viewer may read (RLS: the user and their trainers of live pairs). */
async function badgesOf(supabase: Supabase, userId: string): Promise<EarnedBadge[]> {
  const { data, error } = await supabase.from("user_badges").select("badge_code, awarded_at, seen_at").eq("user_id", userId);
  if (error) throw new Error(`loading badges failed: ${error.code}`);
  return data.flatMap((row) =>
    isBadgeCode(row.badge_code) ? [{ code: row.badge_code, awardedAt: row.awarded_at, seen: row.seen_at !== null }] : [],
  );
}

/** The viewer's time zone, for the dates of the badges. */
async function viewerTimeZone(supabase: Supabase, userId: string): Promise<string> {
  const { data } = await supabase.from("user_settings").select("time_zone").eq("user_id", userId).maybeSingle();
  return data?.time_zone ?? "Europe/Moscow";
}

export type Gamification = { userId: string; streaks: Streaks; badges: EarnedBadge[]; timeZone: string };

/** The signed-in client's streaks and badges. Null without a session. */
export async function loadMyGamification(): Promise<Gamification | null> {
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  const userId = session?.claims.sub;
  if (!userId) return null;
  const [streaks, badges, timeZone] = await Promise.all([
    supabase.rpc("my_streaks").maybeSingle(),
    badgesOf(supabase, userId),
    viewerTimeZone(supabase, userId),
  ]);
  if (streaks.error) throw new Error(`loading streaks failed: ${streaks.error.code}`);
  const shaped = toStreaks(streaks.data);
  return shaped ? { userId, streaks: shaped, badges, timeZone } : null;
}

/** The streaks and badges of the client of a live pair, for its trainer. Null outside the pair or for a card. */
export async function loadPairGamification(coachingId: string): Promise<(Gamification & { coachingId: string }) | null> {
  if (!ID.test(coachingId)) return null;
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  const viewerId = session?.claims.sub;
  if (!viewerId) return null;
  const [pair, streaks, timeZone] = await Promise.all([
    supabase.from("coachings").select("client_id").eq("id", coachingId).maybeSingle(),
    supabase.rpc("pair_streaks", { p_coaching: coachingId }).maybeSingle(),
    viewerTimeZone(supabase, viewerId),
  ]);
  if (streaks.error) throw new Error(`loading pair streaks failed: ${streaks.error.code}`);
  const shaped = toStreaks(streaks.data);
  if (!pair.data || !shaped) return null;
  return {
    coachingId,
    userId: pair.data.client_id,
    streaks: shaped,
    badges: await badgesOf(supabase, pair.data.client_id),
    timeZone,
  };
}
