"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { isDay } from "@/lib/passes/present";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  HEIGHT_MAX_CM,
  HEIGHT_MIN_CM,
  KCAL_MAX,
  KCAL_MIN,
  WEIGHT_MAX_KG,
  WEIGHT_MIN_KG,
  isActivityLevel,
  isCalcSex,
  isGoal,
  parseCalcResult,
  type ActivityLevel,
  type CalcResult,
  type CalcSex,
  type Goal,
} from "./target";

export type NutritionActionResult = { ok: true } | { ok: false; reason: "invalid" | "failed" };

const isId = (value: unknown) => z.uuid().safeParse(value).success;
const inRange = (value: unknown, min: number, max: number) => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
const grams = (value: unknown, max: number) => value === null || (Number.isInteger(value) && inRange(value, 0, max));

function failed(what: string, error: { code: string }): { ok: false; reason: "failed" } {
  console.error(`${what} failed`, error.code);
  return { ok: false, reason: "failed" };
}

export type CalcInput = { goal: Goal; sex: CalcSex; birthDate: string; heightCm: number; activity: ActivityLevel; weightKg: number };

/**
 * "Рассчитать": saves the goal and the calculator inputs, then runs the calculator (wave-2 §1–2). Nothing becomes
 * the target until the client confirms with saveCalculatorTarget, so a goal change shows the new result first
 * (§1.3). Trainers with their own target hear about the new goal from the database.
 */
export async function calculateNutrition(input: CalcInput): Promise<{ ok: true; result: CalcResult } | { ok: false; reason: "invalid" | "failed" }> {
  if (
    !isGoal(input.goal) ||
    !isCalcSex(input.sex) ||
    !isActivityLevel(input.activity) ||
    !isDay(input.birthDate) ||
    input.birthDate < "1900-01-02" ||
    !inRange(input.heightCm, HEIGHT_MIN_CM, HEIGHT_MAX_CM) ||
    !inRange(input.weightKg, WEIGHT_MIN_KG, WEIGHT_MAX_KG)
  ) {
    return { ok: false, reason: "invalid" };
  }
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  const userId = session?.claims.sub;
  if (!userId) return { ok: false, reason: "invalid" };

  const { error: bodyError } = await supabase.from("body_profiles").upsert(
    {
      user_id: userId,
      calc_sex: input.sex,
      birth_date: input.birthDate,
      height_cm: Math.round(input.heightCm * 10) / 10,
      activity_level: input.activity,
    },
    { onConflict: "user_id" },
  );
  if (bodyError) return failed("saving the body profile", bodyError);
  const { error: goalError } = await supabase.rpc("set_client_goal", { p_goal: input.goal });
  if (goalError) return failed("saving the goal", goalError);
  const { data, error } = await supabase.rpc("calculate_nutrition_target", { p_weight_kg: input.weightKg });
  if (error) return error.code === "22023" ? { ok: false, reason: "invalid" } : failed("running the calculator", error);
  refresh();
  return { ok: true, result: parseCalcResult(data) };
}

/** "Сохранить норму": the calculator's result for this weight becomes the calculator target from today. */
export async function saveCalculatorTarget(weightKg: number): Promise<NutritionActionResult> {
  if (!inRange(weightKg, WEIGHT_MIN_KG, WEIGHT_MAX_KG)) return { ok: false, reason: "invalid" };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("save_calculator_target", { p_weight_kg: weightKg });
  if (error) return error.code === "22023" ? { ok: false, reason: "invalid" } : failed("saving the calculator target", error);
  refresh();
  return { ok: true };
}

/** The client picks whose trainer target is active; null goes back to the latest set (§2.13). */
export async function chooseNutritionTarget(coachingId: string | null): Promise<NutritionActionResult> {
  if (coachingId !== null && !isId(coachingId)) return { ok: false, reason: "invalid" };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("choose_nutrition_target", { p_coaching_id: coachingId as string });
  if (error) return error.code === "42501" ? { ok: false, reason: "invalid" } : failed("choosing the target", error);
  refresh();
  return { ok: true };
}

export type PairTargetInput = {
  coachingId: string;
  kcal: number;
  proteinG: number | null;
  fatG: number | null;
  carbsG: number | null;
  /** The trainer confirmed the warning for a target under 1200/1500 kcal (§2.12). */
  confirmLow: boolean;
};

/** The trainer sets the client's target; "low" asks for the confirmation the trainer has not given yet. */
export async function setPairTarget(input: PairTargetInput): Promise<NutritionActionResult | { ok: false; reason: "low" }> {
  if (
    !isId(input.coachingId) ||
    !Number.isInteger(input.kcal) ||
    !inRange(input.kcal, KCAL_MIN, KCAL_MAX) ||
    !grams(input.proteinG, 1000) ||
    !grams(input.fatG, 1000) ||
    !grams(input.carbsG, 2000)
  ) {
    return { ok: false, reason: "invalid" };
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_nutrition_target", {
    p_coaching_id: input.coachingId,
    p_kcal: input.kcal,
    p_protein_g: input.proteinG as number,
    p_fat_g: input.fatG as number,
    p_carbs_g: input.carbsG as number,
    p_confirm_low: input.confirmLow === true,
  });
  if (error?.message === "low_kcal_unconfirmed") return { ok: false, reason: "low" };
  // 42501: the client closed nutrition to this trainer, or the pair has ended.
  if (error) return error.code === "42501" || error.code === "22023" ? { ok: false, reason: "invalid" } : failed("setting the target", error);
  refresh();
  return { ok: true };
}

/** The trainer removes their target; the next source takes over from the client's today (§2.5). */
export async function clearPairTarget(coachingId: string): Promise<NutritionActionResult> {
  if (!isId(coachingId)) return { ok: false, reason: "invalid" };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("clear_nutrition_target", { p_coaching_id: coachingId });
  if (error) return error.code === "42501" ? { ok: false, reason: "invalid" } : failed("removing the target", error);
  refresh();
  return { ok: true };
}
