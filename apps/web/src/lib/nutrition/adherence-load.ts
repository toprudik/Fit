import "server-only";
import { displayName } from "@/lib/pairs/clients";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toAdherence, type Adherence, type AdherencePeriod } from "./adherence";

/** One client's adherence over 7 and 30 days for the pair's "Питание" tab (§5); null without access. */
export async function loadPairAdherence(coachingId: string): Promise<{ week: Adherence; month: Adherence } | null> {
  const supabase = await createSupabaseServerClient();
  const { data: pair, error } = await supabase.from("coachings").select("client_id").eq("id", coachingId).maybeSingle();
  if (error) throw new Error(`loading the pair failed: ${error.code}`);
  if (!pair) return null;
  const [week, month] = await Promise.all(
    ([7, 30] as const).map(async (days) => {
      const { data, error: failed } = await supabase.rpc("nutrition_adherence", { p_client_id: pair.client_id, p_days: days });
      if (failed) throw new Error(`loading adherence failed: ${failed.code}`);
      return data[0] ? toAdherence(data[0], days) : null;
    }),
  );
  return week && month ? { week, month } : null;
}

export type NutritionClient = {
  coachingId: string;
  name: string;
  photoUrl: string | null;
  adherence: Adherence;
  lastDay: string | null;
};

// telegram_id is not granted, so profile columns are always listed.
const PERSON_COLUMNS = "id, first_name, last_name, display_name, username, photo_url";

/** The trainer's "Питание" list (§5.5): live pairs that share nutrition. Null without a session. */
export async function loadNutritionClients(days: AdherencePeriod): Promise<NutritionClient[] | null> {
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  if (!session?.claims.sub) return null;
  const { data: rows, error } = await supabase.rpc("trainer_nutrition_adherence", { p_days: days });
  if (error) throw new Error(`loading adherence failed: ${error.code}`);
  if (!rows.length) return [];
  const [people, meta] = await Promise.all([
    supabase
      .from("profiles")
      .select(PERSON_COLUMNS)
      .in(
        "id",
        rows.map((row) => row.client_id),
      ),
    supabase
      .from("coaching_trainer_meta")
      .select("coaching_id, client_alias")
      .in(
        "coaching_id",
        rows.map((row) => row.coaching_id),
      ),
  ]);
  for (const result of [people, meta]) if (result.error) throw new Error(`loading clients failed: ${result.error.code}`);
  const personById = new Map((people.data ?? []).map((person) => [person.id, person]));
  const aliasById = new Map((meta.data ?? []).map((row) => [row.coaching_id, row.client_alias]));
  return rows.map((row) => {
    const person = personById.get(row.client_id);
    return {
      coachingId: row.coaching_id,
      name: displayName(person, aliasById.get(row.coaching_id)),
      photoUrl: person?.photo_url ?? null,
      adherence: toAdherence(row, days),
      lastDay: row.last_day,
    };
  });
}
