import "server-only";

import { addDays } from "@/lib/homework/homework";
import { todayIn } from "@/lib/passes/present";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/database.types";
import { activityDay, DEFAULT_STEPS_GOAL, waterGoalMl, type ActivityDay, type ActivityEntry } from "./activity";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

const COLUMNS = "id, local_date, metric, value, sleep_quality, source";
type Row = Pick<Tables<"activity_entries">, "id" | "local_date" | "metric" | "value" | "sleep_quality" | "source">;

/** How many days the diary and the trainer look back, today included. */
export const ACTIVITY_DAYS = 7;
/** How far back a day can be filled in, as private.check_activity_day allows. */
export const ACTIVITY_PAST_DAYS = 366;

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toEntry(row: Row): ActivityEntry {
  return {
    id: row.id,
    localDate: row.local_date,
    metric: row.metric,
    value: row.value,
    sleepQuality: row.sleep_quality,
    source: row.source,
  };
}

export type ActivityWeek = {
  today: string;
  /** The last day of the list: today, or the day the client opened. */
  day: string;
  days: { day: string; activity: ActivityDay }[];
};

/** The rows of a client's days up to `day` the viewer may read (RLS: water by "питание", steps and sleep by "шаги"). */
async function week(supabase: Supabase, clientId: string, day: string, today: string): Promise<ActivityWeek> {
  const from = addDays(day, -(ACTIVITY_DAYS - 1));
  const { data, error } = await supabase
    .from("activity_entries")
    .select(COLUMNS)
    .eq("client_id", clientId)
    .gte("local_date", from)
    .lte("local_date", day);
  if (error) throw new Error(`loading activity failed: ${error.code}`);
  const entries = (data as Row[]).map(toEntry);
  const days = Array.from({ length: ACTIVITY_DAYS }, (_, i) => addDays(day, -i));
  return { today, day, days: days.map((d) => ({ day: d, activity: activityDay(entries, d) })) };
}

export type MyActivity = ActivityWeek & {
  goals: { steps: number; waterMl: number | null };
  /** The iOS Shortcuts token, without the token itself (shown once when issued). */
  token: { createdAt: string; lastUsedAt: string | null } | null;
};

/**
 * The signed-in client's activity: the days up to `requested` (today when it is missing, in the future or more
 * than a year back), the goals and the Shortcuts token. Null without a session.
 */
export async function loadMyActivity(requested: string | null = null): Promise<MyActivity | null> {
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  const userId = session?.claims.sub;
  if (!userId) return null;
  const [settings, target, weight, token] = await Promise.all([
    supabase.from("user_settings").select("time_zone").eq("user_id", userId).maybeSingle(),
    supabase.rpc("my_nutrition_target"),
    supabase
      .from("measurements")
      .select("value")
      .eq("client_id", userId)
      .eq("kind", "weight")
      .order("measured_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("ingest_tokens").select("created_at, last_used_at").eq("user_id", userId).is("revoked_at", null).maybeSingle(),
  ]);
  const today = todayIn(settings.data?.time_zone ?? "Europe/Moscow");
  const day = requested && requested <= today && requested >= addDays(today, -ACTIVITY_PAST_DAYS) ? requested : today;
  const targetId = target.data?.[0]?.id;
  const goals = targetId
    ? (await supabase.from("nutrition_targets").select("water_ml, steps_target").eq("id", targetId).maybeSingle()).data
    : null;
  return {
    ...(await week(supabase, userId, day, today)),
    goals: {
      steps: goals?.steps_target || DEFAULT_STEPS_GOAL,
      waterMl: waterGoalMl(goals?.water_ml ?? null, weight.data ? Number(weight.data.value) : null),
    },
    token: token.data ? { createdAt: token.data.created_at, lastUsedAt: token.data.last_used_at } : null,
  };
}

/**
 * A client's activity for the trainer of the pair: the last days by the client's day, with what the shares
 * open (each metric is hidden by RLS when its share is off). Null outside the pair.
 */
export async function loadPairActivity(
  coachingId: string,
): Promise<(ActivityWeek & { shows: { steps: boolean; water: boolean } }) | null> {
  if (!ID.test(coachingId)) return null;
  const supabase = await createSupabaseServerClient();
  const [pair, today, shares] = await Promise.all([
    supabase.from("coachings").select("client_id").eq("id", coachingId).maybeSingle(),
    supabase.rpc("homework_today", { p_coaching: coachingId }),
    supabase.from("data_shares").select("nutrition, steps").eq("coaching_id", coachingId).maybeSingle(),
  ]);
  if (!pair.data || !today.data) return null;
  return {
    ...(await week(supabase, pair.data.client_id, today.data, today.data)),
    shows: { steps: shares.data?.steps ?? false, water: shares.data?.nutrition ?? false },
  };
}
