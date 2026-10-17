import type { Database } from "@/lib/supabase/database.types";

export type Goal = Database["public"]["Enums"]["goal_type"];
export type ActivityLevel = Database["public"]["Enums"]["activity_level"];
export type CalcSex = Database["public"]["Enums"]["calc_sex"];
export type TargetSource = Database["public"]["Enums"]["target_source"];

export const GOALS = ["lose", "maintain", "gain"] as const satisfies readonly Goal[];
export const ACTIVITY_LEVELS = ["minimal", "low", "moderate", "high", "very_high"] as const satisfies readonly ActivityLevel[];
export const CALC_SEXES = ["female", "male"] as const satisfies readonly CalcSex[];

export const isGoal = (value: unknown): value is Goal => (GOALS as readonly unknown[]).includes(value);
export const isActivityLevel = (value: unknown): value is ActivityLevel => (ACTIVITY_LEVELS as readonly unknown[]).includes(value);
export const isCalcSex = (value: unknown): value is CalcSex => (CALC_SEXES as readonly unknown[]).includes(value);

/** Kcal, protein, fat and carbs of a target; macros are optional when a trainer sets only kcal. */
export type Macros = { kcal: number; proteinG: number | null; fatG: number | null; carbsG: number | null };

/** What the calculator answered (wave-2 §2): a target, or why it offers none. */
export type CalcResult =
  | ({ status: "ok"; bmr: number; age: number } & { kcal: number; proteinG: number; fatG: number; carbsG: number })
  | { status: "minor" | "too_low" | "incomplete" };

/** A trainer's water and steps goals a day (wave-2 §4 rules 5 and 7); null keeps the default. */
export type ActivityGoals = { waterMl: number | null; steps: number | null };

export const KCAL_MIN = 500;
export const KCAL_MAX = 10000;
/** Bounds of the trainer's water and steps goals, as the database checks them. */
export const WATER_ML_MAX = 10000;
export const STEPS_MAX = 100000;
export const WEIGHT_MIN_KG = 25;
export const WEIGHT_MAX_KG = 350;
export const HEIGHT_MIN_CM = 80;
export const HEIGHT_MAX_CM = 260;

/** The floor under which the calculator offers nothing and a trainer must confirm (§2.8, §2.12). */
export function minKcal(sex: CalcSex | null): number {
  return sex === "male" ? 1500 : 1200;
}

/** Kcal of the macros at 4/9/4 kcal per gram; null until all three are given. */
export function kcalOfMacros(proteinG: number | null, fatG: number | null, carbsG: number | null): number | null {
  if (proteinG === null || fatG === null || carbsG === null) return null;
  return proteinG * 4 + fatG * 9 + carbsG * 4;
}

/** kcal in one gram of protein, fat and carbs. */
const KCAL_PER_GRAM = { protein: 4, fat: 9, carbs: 4 } as const;
export type Macro = keyof typeof KCAL_PER_GRAM;

/** Grams of a macro that give this share of the kcal, rounded to whole grams (§2.11: macros in %). */
export const gramsOfPercent = (kcal: number, macro: Macro, percent: number) => Math.round((kcal * percent) / 100 / KCAL_PER_GRAM[macro]);

/** The share of the kcal these grams give, rounded to a whole percent; null without kcal. */
export const percentOfGrams = (kcal: number, macro: Macro, grams: number) =>
  kcal > 0 ? Math.round(((grams * KCAL_PER_GRAM[macro]) / kcal) * 100) : null;

/** True when the macros add up to more than 5% away from the kcal (§2.11). */
export function macrosDisagree(target: Macros): boolean {
  const fromMacros = kcalOfMacros(target.proteinG, target.fatG, target.carbsG);
  return fromMacros !== null && Math.abs(fromMacros - target.kcal) > target.kcal * 0.05;
}

/** Reads the jsonb the calculator returns. */
export function parseCalcResult(value: unknown): CalcResult {
  const row = (value ?? {}) as Record<string, unknown>;
  if (row.status === "ok") {
    return {
      status: "ok",
      kcal: Number(row.kcal),
      proteinG: Number(row.protein_g),
      fatG: Number(row.fat_g),
      carbsG: Number(row.carbs_g),
      bmr: Number(row.bmr),
      age: Number(row.age),
    };
  }
  return { status: row.status === "minor" || row.status === "too_low" ? row.status : "incomplete" };
}

/** Whole years between a birth date and a day, both YYYY-MM-DD. */
export function ageOn(birthDate: string, day: string): number {
  const [by, bm, bd] = birthDate.split("-").map(Number);
  const [y, m, d] = day.split("-").map(Number);
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}
