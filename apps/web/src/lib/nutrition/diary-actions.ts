"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { isLocale, type Locale } from "@/i18n/config";
import { isDay } from "@/lib/passes/present";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { COMMENT_MAX, ENTRY_GRAMS_MAX, ENTRY_KCAL_MAX, FOOD_KCAL_100_MAX, SERVINGS_MAX, isMeal, type Meal } from "./diary";
import { foodByBarcode, searchFoods, type BarcodeLookup, type FoodSearch } from "./foods";
import { normalizeBarcode } from "./off-parse";

export type DiaryActionResult = { ok: true } | { ok: false; reason: "invalid" | "taken" | "failed" };

const isId = (value: unknown): value is string => z.uuid().safeParse(value).success;
const inRange = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
const optional = (value: unknown, max: number) => value === null || inRange(value, 0, max);

function failed(what: string, error: { code: string }): { ok: false; reason: "invalid" | "taken" | "failed" } {
  if (error.code === "22023" || error.code === "P0002") return { ok: false, reason: "invalid" };
  if (error.code === "23505") return { ok: false, reason: "taken" };
  console.error(`${what} failed`, error.code);
  return { ok: false, reason: "failed" };
}

/** "Поиск" in "+ Еда" (§3.2, §3.8). The screen passes its locale: getLocale() throws inside a Server Action. */
export async function findFoods(query: string, locale: Locale): Promise<FoodSearch> {
  if (typeof query !== "string" || !isLocale(locale)) return { foods: [], catalogDown: false, drafts: [] };
  return searchFoods(query, locale);
}

/** A scanned or typed barcode (§3.2–3.4); invalid digits give no food. */
export async function findBarcode(value: string, locale: Locale): Promise<BarcodeLookup & { barcode: string | null }> {
  const barcode = typeof value === "string" ? normalizeBarcode(value) : null;
  if (!barcode || !isLocale(locale)) return { food: null, catalogDown: false, draft: null, barcode: null };
  return { ...(await foodByBarcode(barcode, locale)), barcode };
}

export type EntryInput =
  | { day: string; meal: Meal; foodId: string; grams: number; servings?: undefined }
  | { day: string; meal: Meal; foodId: string; servings: number; grams?: undefined }
  | { day: string; meal: Meal; kcal: number; proteinG: number | null; fatG: number | null; carbsG: number | null; title: string };

/** Adds a food with grams or servings, or quick kcal (§3.2–3.4). The database computes the values. */
export async function addEntry(input: EntryInput): Promise<DiaryActionResult> {
  if (!isDay(input.day) || !isMeal(input.meal)) return { ok: false, reason: "invalid" };
  const supabase = await createSupabaseServerClient();
  if ("foodId" in input) {
    if (!isId(input.foodId)) return { ok: false, reason: "invalid" };
    if (input.servings !== undefined ? !inRange(input.servings, 0.01, SERVINGS_MAX) : !inRange(input.grams, 0.1, ENTRY_GRAMS_MAX)) {
      return { ok: false, reason: "invalid" };
    }
    const { error } = await supabase.rpc("add_food_entry", {
      p_day: input.day,
      p_meal: input.meal,
      p_food_id: input.foodId,
      ...(input.servings !== undefined ? { p_servings: input.servings } : { p_grams: input.grams }),
    });
    if (error) return failed("adding an entry", error);
  } else {
    if (
      !inRange(input.kcal, 1, ENTRY_KCAL_MAX) ||
      !optional(input.proteinG, 1000) ||
      !optional(input.fatG, 1000) ||
      !optional(input.carbsG, 1000) ||
      typeof input.title !== "string" ||
      input.title.length > 200
    ) {
      return { ok: false, reason: "invalid" };
    }
    const { error } = await supabase.rpc("add_food_entry", {
      p_day: input.day,
      p_meal: input.meal,
      p_kcal: input.kcal,
      ...(input.proteinG === null ? {} : { p_protein: input.proteinG }),
      ...(input.fatG === null ? {} : { p_fat: input.fatG }),
      ...(input.carbsG === null ? {} : { p_carbs: input.carbsG }),
      ...(input.title.trim() ? { p_title: input.title.trim() } : {}),
    });
    if (error) return failed("adding quick kcal", error);
  }
  refresh();
  return { ok: true };
}

export type EntryChange = { id: string; meal: Meal; grams?: number; servings?: number; kcal?: number };

/** Changes the meal and the amount (or quick kcal) of an own entry on any day (§3.8). */
export async function updateEntry(change: EntryChange): Promise<DiaryActionResult> {
  if (!isId(change.id) || !isMeal(change.meal)) return { ok: false, reason: "invalid" };
  if (change.grams !== undefined && !inRange(change.grams, 0.1, ENTRY_GRAMS_MAX)) return { ok: false, reason: "invalid" };
  if (change.servings !== undefined && !inRange(change.servings, 0.01, SERVINGS_MAX)) return { ok: false, reason: "invalid" };
  if (change.kcal !== undefined && !inRange(change.kcal, 1, ENTRY_KCAL_MAX)) return { ok: false, reason: "invalid" };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("update_food_entry", {
    p_id: change.id,
    p_meal: change.meal,
    ...(change.grams !== undefined ? { p_grams: change.grams } : {}),
    ...(change.servings !== undefined ? { p_servings: change.servings } : {}),
    ...(change.kcal !== undefined ? { p_kcal: change.kcal } : {}),
  });
  if (error) return failed("updating an entry", error);
  refresh();
  return { ok: true };
}

export async function deleteEntry(id: string): Promise<DiaryActionResult> {
  if (!isId(id)) return { ok: false, reason: "invalid" };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("food_diary_entries").delete().eq("id", id);
  if (error) return failed("deleting an entry", error);
  refresh();
  return { ok: true };
}

/** "Как вчера" (§3.7): the meal of the day before goes into the same meal of this day. */
export async function copyPreviousMeal(day: string, meal: Meal): Promise<DiaryActionResult> {
  if (!isDay(day) || !isMeal(meal)) return { ok: false, reason: "invalid" };
  const previous = new Date(`${day}T00:00:00Z`);
  previous.setUTCDate(previous.getUTCDate() - 1);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("copy_food_meal", { p_from: previous.toISOString().slice(0, 10), p_meal: meal, p_to: day });
  if (error) return failed("copying a meal", error);
  refresh();
  return { ok: true };
}

export type FoodInput = {
  id: string | null;
  name: string;
  brand: string;
  barcode: string;
  kcal100: number;
  protein100: number | null;
  fat100: number | null;
  carbs100: number | null;
  servingG: number | null;
  servingLabel: string;
};

/** Creates or edits an own product with values per 100 g (§3.2, §3.10). Returns the product id. */
export async function saveFood(input: FoodInput): Promise<{ ok: true; id: string } | { ok: false; reason: "invalid" | "taken" | "failed" }> {
  const barcode = input.barcode.trim() ? normalizeBarcode(input.barcode) : null;
  const macros = (input.protein100 ?? 0) + (input.fat100 ?? 0) + (input.carbs100 ?? 0);
  if (
    (input.id !== null && !isId(input.id)) ||
    typeof input.name !== "string" ||
    !input.name.trim() ||
    input.name.length > 200 ||
    input.brand.length > 200 ||
    input.servingLabel.length > 80 ||
    (input.barcode.trim() && !barcode) ||
    !inRange(input.kcal100, 0, FOOD_KCAL_100_MAX) ||
    !optional(input.protein100, 100) ||
    !optional(input.fat100, 100) ||
    !optional(input.carbs100, 100) ||
    macros > 100 ||
    !(input.servingG === null || inRange(input.servingG, 0.1, ENTRY_GRAMS_MAX))
  ) {
    return { ok: false, reason: "invalid" };
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("save_food", {
    p_id: input.id as string,
    p_name: input.name.trim(),
    p_kcal: input.kcal100,
    ...(input.protein100 === null ? {} : { p_protein: input.protein100 }),
    ...(input.fat100 === null ? {} : { p_fat: input.fat100 }),
    ...(input.carbs100 === null ? {} : { p_carbs: input.carbs100 }),
    ...(input.servingG === null ? {} : { p_serving_g: input.servingG }),
    ...(input.servingLabel.trim() ? { p_serving_label: input.servingLabel.trim() } : {}),
    ...(barcode ? { p_barcode: barcode } : {}),
    ...(input.brand.trim() ? { p_brand: input.brand.trim() } : {}),
  });
  if (error || !data) return failed("saving a food", error ?? { code: "no_id" });
  refresh();
  return { ok: true, id: data };
}

/** Creates an own dish from products with grams (§3.2, §3.5); the cooked weight is optional. */
export async function saveDish(input: {
  name: string;
  items: { foodId: string; grams: number }[];
  totalG: number | null;
}): Promise<{ ok: true; id: string } | { ok: false; reason: "invalid" | "taken" | "failed" }> {
  if (
    typeof input.name !== "string" ||
    !input.name.trim() ||
    input.name.length > 200 ||
    !Array.isArray(input.items) ||
    input.items.length < 1 ||
    input.items.length > 50 ||
    input.items.some((item) => !isId(item.foodId) || !inRange(item.grams, 0.1, ENTRY_GRAMS_MAX)) ||
    !(input.totalG === null || inRange(input.totalG, 1, 50000))
  ) {
    return { ok: false, reason: "invalid" };
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("save_dish", {
    p_id: null as unknown as string,
    p_name: input.name.trim(),
    p_items: input.items.map((item) => ({ food_id: item.foodId, grams: item.grams })),
    ...(input.totalG === null ? {} : { p_total_g: input.totalG }),
  });
  if (error || !data) return failed("saving a dish", error ?? { code: "no_id" });
  refresh();
  return { ok: true, id: data };
}

export async function archiveFood(id: string): Promise<DiaryActionResult> {
  if (!isId(id)) return { ok: false, reason: "invalid" };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("archive_food", { p_id: id });
  if (error) return failed("archiving a food", error);
  refresh();
  return { ok: true };
}

export async function setFavorite(foodId: string, favorite: boolean): Promise<DiaryActionResult> {
  if (!isId(foodId) || typeof favorite !== "boolean") return { ok: false, reason: "invalid" };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_food_favorite", { p_food_id: foodId, p_favorite: favorite });
  if (error) return failed("marking a favorite", error);
  refresh();
  return { ok: true };
}

const validBody = (body: unknown): body is string => typeof body === "string" && body.trim().length > 0 && body.trim().length <= COMMENT_MAX;

/** The trainer's comment on a day (§3.11); the client hears about it from the bot. */
export async function addComment(coachingId: string, day: string, body: string): Promise<DiaryActionResult> {
  if (!isId(coachingId) || !isDay(day) || !validBody(body)) return { ok: false, reason: "invalid" };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("add_food_comment", { p_coaching_id: coachingId, p_day: day, p_body: body.trim() });
  if (error) return error.code === "42501" ? { ok: false, reason: "invalid" } : failed("adding a comment", error);
  refresh();
  return { ok: true };
}

export async function editComment(id: string, body: string): Promise<DiaryActionResult> {
  if (!isId(id) || !validBody(body)) return { ok: false, reason: "invalid" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("edit_food_comment", { p_id: id, p_body: body.trim() });
  if (error) return failed("editing a comment", error);
  if (!data) return { ok: false, reason: "invalid" };
  refresh();
  return { ok: true };
}

export async function deleteComment(id: string): Promise<DiaryActionResult> {
  if (!isId(id)) return { ok: false, reason: "invalid" };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("delete_food_comment", { p_id: id });
  if (error) return failed("deleting a comment", error);
  refresh();
  return { ok: true };
}

/** The client hides a comment on their side, or shows it again (§3.14). */
export async function hideComment(id: string, hidden: boolean): Promise<DiaryActionResult> {
  if (!isId(id) || typeof hidden !== "boolean") return { ok: false, reason: "invalid" };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("hide_food_comment", { p_id: id, p_hidden: hidden });
  if (error) return failed("hiding a comment", error);
  refresh();
  return { ok: true };
}
