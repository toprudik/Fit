import type { Locale } from "@/i18n/config";
import { unitSystem } from "@/lib/progress/measurements";
import type { Database } from "@/lib/supabase/database.types";

export type Meal = Database["public"]["Enums"]["meal_type"];

/** The order of meals in a day (§3.1). */
export const MEALS = ["breakfast", "lunch", "dinner", "snack"] as const satisfies readonly Meal[];
export const isMeal = (value: unknown): value is Meal => (MEALS as readonly unknown[]).includes(value);

/** Limits of §3.10, checked again by the database. */
export const ENTRY_GRAMS_MAX = 5000;
export const ENTRY_KCAL_MAX = 5000;
export const SERVINGS_MAX = 100;
export const FOOD_KCAL_100_MAX = 900;

/**
 * The unit of a portion's weight in the interface: ounces in English, grams otherwise (wave-2 units, §3 rule 4).
 * The database always keeps grams; macros and the values per 100 g stay in grams, as on labels.
 */
export type PortionUnit = "g" | "oz";
const GRAMS_PER_OZ = 28.349523125;
export const portionUnit = (locale: Locale): PortionUnit => (unitSystem(locale) === "imperial" ? "oz" : "g");
/** A weight typed in the portion unit, in grams to a tenth. */
export const gramsOfPortion = (value: number, unit: PortionUnit) => (unit === "oz" ? Math.round(value * GRAMS_PER_OZ * 10) / 10 : value);
/** Grams in the portion unit: ounces to a tenth, grams as they are. */
export const portionOfGrams = (grams: number, unit: PortionUnit) => (unit === "oz" ? Math.round((grams / GRAMS_PER_OZ) * 10) / 10 : grams);
/** The smallest and the largest portion one entry takes, in the portion unit (§3.10). */
export const portionRange = (unit: PortionUnit): [number, number] =>
  unit === "oz" ? [0.1, Math.floor((ENTRY_GRAMS_MAX / GRAMS_PER_OZ) * 10) / 10] : [1, ENTRY_GRAMS_MAX];
export const COMMENT_MAX = 1000;

export type DiaryEntry = {
  id: string;
  meal: Meal;
  foodId: string | null;
  title: string | null;
  grams: number | null;
  servings: number | null;
  kcal: number;
  proteinG: number | null;
  fatG: number | null;
  carbsG: number | null;
};

export type Totals = { kcal: number; proteinG: number; fatG: number; carbsG: number };

const tenth = (value: number) => Math.round(value * 10) / 10;

/** Sums kcal and macros; a missing macro counts as 0. */
export function totalsOf(entries: readonly Pick<DiaryEntry, "kcal" | "proteinG" | "fatG" | "carbsG">[]): Totals {
  const sum = entries.reduce<Totals>(
    (acc, entry) => ({
      kcal: acc.kcal + entry.kcal,
      proteinG: acc.proteinG + (entry.proteinG ?? 0),
      fatG: acc.fatG + (entry.fatG ?? 0),
      carbsG: acc.carbsG + (entry.carbsG ?? 0),
    }),
    { kcal: 0, proteinG: 0, fatG: 0, carbsG: 0 },
  );
  return { kcal: tenth(sum.kcal), proteinG: tenth(sum.proteinG), fatG: tenth(sum.fatG), carbsG: tenth(sum.carbsG) };
}

/** The entries of each meal, in the order of MEALS. */
export function byMeal<T extends Pick<DiaryEntry, "meal">>(entries: readonly T[]): { meal: Meal; entries: T[] }[] {
  return MEALS.map((meal) => ({ meal, entries: entries.filter((entry) => entry.meal === meal) }));
}

/** Share of the target eaten, 0…1 for the ring; null without a target. */
export function shareOf(eaten: number, target: number | null): number | null {
  if (target === null || target <= 0) return null;
  return Math.min(1, Math.max(0, eaten / target));
}

/** The values of an amount of a food, rounded like the database rounds them. */
export function amountOf(
  food: { kcal100: number; protein100: number | null; fat100: number | null; carbs100: number | null },
  grams: number,
): Totals {
  const part = (value: number | null) => (value === null ? 0 : tenth((value * grams) / 100));
  return { kcal: tenth((food.kcal100 * grams) / 100), proteinG: part(food.protein100), fatG: part(food.fat100), carbsG: part(food.carbs100) };
}

/** The meal "+ Еда" starts with when the diary did not name one: by the hour of the day. */
export function mealAt(hour: number): Meal {
  if (hour >= 5 && hour < 11) return "breakfast";
  if (hour >= 11 && hour < 16) return "lunch";
  if (hour >= 17 && hour < 22) return "dinner";
  return "snack";
}

/** The hour (0–23) now in a time zone. */
export function hourIn(timeZone: string, now: Date = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone }).format(now));
}

/** The day before or after a YYYY-MM-DD day. */
export function shiftDay(day: string, by: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + by);
  return date.toISOString().slice(0, 10);
}

/** A number typed in a field, comma or dot: null when empty, "invalid" when not a number in min…max. */
export function parseAmount(text: string, min: number, max: number): number | null | "invalid" {
  const trimmed = text.trim().replace(",", ".");
  if (!trimmed) return null;
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(trimmed)) return "invalid";
  const value = Number(trimmed);
  return value >= min && value <= max ? value : "invalid";
}

/** "17 октября" or "17 октября 2025" for a diary day; the year shows only when it is not the current one. */
export function formatDiaryDay(intlLocale: string, day: string, today: string): string {
  const sameYear = day.slice(0, 4) === today.slice(0, 4);
  return new Intl.DateTimeFormat(intlLocale, { day: "numeric", month: "long", ...(sameYear ? {} : { year: "numeric" }), timeZone: "UTC" }).format(
    new Date(`${day}T00:00:00Z`),
  );
}
