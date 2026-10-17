import "server-only";
import { todayIn } from "@/lib/passes/present";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ActivityLevel, CalcSex, Goal, Macros } from "./target";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

type TargetRow = { kcal: number; protein_g: number | null; fat_g: number | null; carbs_g: number | null };
const macrosOf = (row: TargetRow): Macros => ({ kcal: row.kcal, proteinG: row.protein_g, fatG: row.fat_g, carbsG: row.carbs_g });

type Person = { id: string; first_name: string | null; last_name: string | null; display_name: string | null };
const nameOf = (person: Person | undefined) =>
  person?.display_name?.trim() || [person?.first_name, person?.last_name].map((part) => part?.trim()).filter(Boolean).join(" ");

/** A trainer's target for the client, from a live pair that shares nutrition. */
export type TrainerTarget = { coachingId: string; trainerName: string; macros: Macros; active: boolean };

export type BodyProfile = { sex: CalcSex | null; birthDate: string | null; heightCm: number | null; activity: ActivityLevel | null };

export type MyNutrition = {
  today: string;
  goal: Goal | null;
  body: BodyProfile;
  /** The latest weight measurement, kg. */
  latestWeightKg: number | null;
  /** The target in force today (wave-2 §2.10), null when there is none. */
  active: { source: "calculator" | "trainer" | "group"; coachingId: string | null; trainerName: string; macros: Macros } | null;
  /** The calculator's target in force, with the weight it was computed for. */
  calculator: (Macros & { weightKg: number | null }) | null;
  trainerTargets: TrainerTarget[];
  /** The client chose whose trainer target is active (§2.13); null = the latest set. */
  preferredCoachingId: string | null;
};

async function latestGoal(supabase: Supabase, userId: string): Promise<Goal | null> {
  const { data, error } = await supabase
    .from("client_goals")
    .select("goal")
    .eq("user_id", userId)
    .order("set_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`loading the goal failed: ${error.code}`);
  return data?.goal ?? null;
}

async function openCalculator(supabase: Supabase, clientId: string): Promise<MyNutrition["calculator"]> {
  const { data, error } = await supabase
    .from("nutrition_targets")
    .select("kcal, protein_g, fat_g, carbs_g, calc_inputs")
    .eq("client_id", clientId)
    .eq("source", "calculator")
    .is("effective_to", null)
    .maybeSingle();
  if (error) throw new Error(`loading the calculator target failed: ${error.code}`);
  if (!data) return null;
  const weight = (data.calc_inputs as { weight_kg?: unknown } | null)?.weight_kg;
  return { ...macrosOf(data), weightKg: typeof weight === "number" ? weight : null };
}

/** Goal, calculator inputs and every target of the signed-in client. Null when signed out. */
export async function loadMyNutrition(): Promise<MyNutrition | null> {
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  const me = session?.claims.sub;
  if (!me) return null;

  const [settings, goal, body, weight, active, calculator, trainers] = await Promise.all([
    supabase.from("user_settings").select("time_zone").eq("user_id", me).maybeSingle(),
    latestGoal(supabase, me),
    supabase.from("body_profiles").select("calc_sex, birth_date, height_cm, activity_level, preferred_target_coaching_id").eq("user_id", me).maybeSingle(),
    supabase
      .from("measurements")
      .select("value")
      .eq("client_id", me)
      .eq("kind", "weight")
      .order("measured_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.rpc("my_nutrition_target").maybeSingle(),
    openCalculator(supabase, me),
    supabase
      .from("nutrition_targets")
      .select("coaching_id, kcal, protein_g, fat_g, carbs_g, created_at, coachings!inner(status, trainer_id, data_shares(nutrition))")
      .eq("client_id", me)
      .eq("source", "trainer")
      .is("effective_to", null)
      .order("created_at", { ascending: false }),
  ]);
  for (const result of [body, weight, active, trainers]) {
    if (result.error) throw new Error(`loading nutrition failed: ${result.error.code}`);
  }

  // Only targets of live pairs that share nutrition count (§2.10); the database applies the same rule.
  const live = (trainers.data ?? []).filter(
    (row) => (row.coachings.status === "trial" || row.coachings.status === "active") && row.coachings.data_shares?.nutrition,
  );
  const people = new Map<string, Person>();
  const trainerIds = [...new Set(live.map((row) => row.coachings.trainer_id))];
  if (trainerIds.length) {
    const { data } = await supabase.from("profiles").select("id, first_name, last_name, display_name").in("id", trainerIds);
    for (const row of data ?? []) people.set(row.id, row);
  }
  const current = active.data;
  return {
    today: todayIn(settings.data?.time_zone ?? "Europe/Moscow"),
    goal,
    body: {
      sex: body.data?.calc_sex ?? null,
      birthDate: body.data?.birth_date ?? null,
      heightCm: body.data?.height_cm == null ? null : Number(body.data.height_cm),
      activity: body.data?.activity_level ?? null,
    },
    latestWeightKg: weight.data ? Number(weight.data.value) : null,
    active:
      current && (current.source === "calculator" || current.source === "trainer" || current.source === "group")
        ? { source: current.source, coachingId: current.coaching_id, trainerName: current.trainer_name ?? "", macros: macrosOf(current) }
        : null,
    calculator,
    trainerTargets: live.map((row) => ({
      coachingId: row.coaching_id as string,
      trainerName: nameOf(people.get(row.coachings.trainer_id)),
      macros: macrosOf(row),
      active: current?.coaching_id === row.coaching_id,
    })),
    preferredCoachingId: body.data?.preferred_target_coaching_id ?? null,
  };
}

export type PairNutrition =
  /** The client keeps nutrition to themselves, or the pair has ended. */
  | { state: "closed" }
  | {
      state: "open";
      goal: Goal | null;
      /** This trainer's target in force. */
      mine: Macros | null;
      /** Whose target is active today, never another trainer's values (§2.8). */
      active: "mine" | "group" | "other_trainer" | "calculator" | "none";
      calculator: MyNutrition["calculator"];
      /** Sex from the client's last calculation, for the low-kcal warning; the database checks it anyway. */
      sex: CalcSex | null;
    };

/** The trainer's "Питание" tab: the client's goal, the trainer's own target and whose target is active. */
export async function loadPairNutrition(coachingId: string): Promise<PairNutrition | null> {
  const supabase = await createSupabaseServerClient();
  const { data: pair, error } = await supabase.from("coachings").select("client_id").eq("id", coachingId).maybeSingle();
  if (error) throw new Error(`loading the pair failed: ${error.code}`);
  if (!pair) return null;
  const { data: state, error: stateError } = await supabase.rpc("pair_nutrition_state", { p_coaching_id: coachingId });
  if (stateError) throw new Error(`loading the target state failed: ${stateError.code}`);
  if (state !== "mine" && state !== "group" && state !== "other_trainer" && state !== "calculator" && state !== "none") return { state: "closed" };

  const [goal, mine, calculator, inputs] = await Promise.all([
    latestGoal(supabase, pair.client_id),
    supabase
      .from("nutrition_targets")
      .select("kcal, protein_g, fat_g, carbs_g")
      .eq("coaching_id", coachingId)
      .eq("source", "trainer")
      .is("effective_to", null)
      .maybeSingle(),
    openCalculator(supabase, pair.client_id),
    supabase
      .from("nutrition_targets")
      .select("calc_inputs")
      .eq("client_id", pair.client_id)
      .eq("source", "calculator")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (mine.error) throw new Error(`loading the trainer target failed: ${mine.error.code}`);
  const sex = (inputs.data?.calc_inputs as { sex?: unknown } | null)?.sex;
  return {
    state: "open",
    goal,
    mine: mine.data ? macrosOf(mine.data) : null,
    active: state,
    calculator,
    sex: sex === "male" || sex === "female" ? sex : null,
  };
}
