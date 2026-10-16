import "server-only";
import { displayName } from "@/lib/pairs/clients";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { sortOffsets } from "./offsets";
import { isToggleType, shortTime, type ToggleType } from "./types";

export type PairReminders = {
  coachingId: string;
  name: string;
  photoUrl: string | null;
  offsets: number[];
};

export type NotificationSettingsData = {
  pairs: PairReminders[];
  /** The trainer's reminders for new clients; null for someone who is not a trainer. */
  trainerDefaults: number[] | null;
  quietHours: { start: string; end: string } | null;
  /** "08:00": when the trainer daily digest leaves (NOTIF-5). */
  digestTime: string;
  disabled: ToggleType[];
};

/** Everything /settings/notifications shows, for the signed-in user. Null without a session. */
export async function loadNotificationSettings(): Promise<NotificationSettingsData | null> {
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  const userId = session?.claims.sub;
  if (!userId) return null;

  const [pairs, trainer, settings, preferences] = await Promise.all([
    supabase
      .from("coachings")
      .select("id, trainer_id, client_reminder_offsets, started_at")
      .eq("client_id", userId)
      .in("status", ["trial", "active"])
      .order("started_at", { ascending: true }),
    supabase.from("trainer_profiles").select("default_client_reminder_offsets").eq("user_id", userId).maybeSingle(),
    supabase.from("user_settings").select("quiet_hours_start, quiet_hours_end, daily_digest_time").eq("user_id", userId).maybeSingle(),
    supabase.from("notification_preferences").select("type, enabled").eq("user_id", userId),
  ]);
  if (pairs.error) throw new Error(`loading pairs failed: ${pairs.error.code}`);
  if (trainer.error) throw new Error(`loading the trainer profile failed: ${trainer.error.code}`);
  if (settings.error) throw new Error(`loading settings failed: ${settings.error.code}`);
  if (preferences.error) throw new Error(`loading notification preferences failed: ${preferences.error.code}`);

  // telegram_id is not granted, so the columns are listed.
  const people = pairs.data.length
    ? await supabase
        .from("profiles")
        .select("id, first_name, last_name, display_name, username, photo_url")
        .in(
          "id",
          pairs.data.map((pair) => pair.trainer_id),
        )
    : { data: [], error: null };
  if (people.error) throw new Error(`loading trainers failed: ${people.error.code}`);
  const byId = new Map(people.data.map((person) => [person.id, person]));

  const start = shortTime(settings.data?.quiet_hours_start);
  const end = shortTime(settings.data?.quiet_hours_end);
  return {
    pairs: pairs.data.map((pair) => {
      const person = byId.get(pair.trainer_id);
      return {
        coachingId: pair.id,
        name: displayName(person),
        photoUrl: person?.photo_url ?? null,
        offsets: sortOffsets(pair.client_reminder_offsets),
      };
    }),
    trainerDefaults: trainer.data ? sortOffsets(trainer.data.default_client_reminder_offsets) : null,
    quietHours: start && end ? { start, end } : null,
    digestTime: shortTime(settings.data?.daily_digest_time) ?? "08:00",
    disabled: preferences.data.filter((row) => !row.enabled && isToggleType(row.type)).map((row) => row.type as ToggleType),
  };
}
