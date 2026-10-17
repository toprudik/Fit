import "server-only";
import { isDay, todayIn } from "@/lib/passes/present";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { MEALS, type DiaryEntry, type Meal } from "./diary";
import { toFood, type Food } from "./foods";
import type { Macros, TargetSource } from "./target";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

const ENTRY_COLUMNS = "id, meal, food_id, title, grams, servings, kcal, protein_g, fat_g, carbs_g, logged_at";
const num = (value: number | null) => (value === null ? null : Number(value));

type EntryRow = {
  id: string;
  meal: Meal;
  food_id: string | null;
  title: string | null;
  grams: number | null;
  servings: number | null;
  kcal: number;
  protein_g: number | null;
  fat_g: number | null;
  carbs_g: number | null;
};
const toEntry = (row: EntryRow): DiaryEntry => ({
  id: row.id,
  meal: row.meal,
  foodId: row.food_id,
  title: row.title,
  grams: num(row.grams),
  servings: num(row.servings),
  kcal: Number(row.kcal),
  proteinG: num(row.protein_g),
  fatG: num(row.fat_g),
  carbsG: num(row.carbs_g),
});

/** The target of the day: values, or only the fact that another trainer's target is active. */
export type DayTarget = { source: TargetSource; macros: Macros } | { source: "trainer"; otherTrainer: true } | null;

async function targetOn(supabase: Supabase, clientId: string, day: string): Promise<DayTarget> {
  const { data, error } = await supabase.rpc("nutrition_target_on", { p_client_id: clientId, p_day: day }).maybeSingle();
  if (error) throw new Error(`loading the day target failed: ${error.code}`);
  if (!data) return null;
  if (data.other_trainer) return { source: "trainer", otherTrainer: true };
  if (data.kcal === null) return null;
  return { source: data.source, macros: { kcal: data.kcal, proteinG: data.protein_g, fatG: data.fat_g, carbsG: data.carbs_g } };
}

async function entriesOn(supabase: Supabase, clientId: string, day: string): Promise<DiaryEntry[]> {
  const { data, error } = await supabase
    .from("food_diary_entries")
    .select(ENTRY_COLUMNS)
    .eq("client_id", clientId)
    .eq("local_date", day)
    .order("logged_at");
  if (error) throw new Error(`loading the diary failed: ${error.code}`);
  return (data ?? []).map(toEntry);
}

type Person = { id: string; first_name: string | null; last_name: string | null; display_name: string | null };
const nameOf = (person: Person | undefined) =>
  person?.display_name?.trim() || [person?.first_name, person?.last_name].map((part) => part?.trim()).filter(Boolean).join(" ");

export type DayComment = { id: string; body: string; authorName: string; authorId: string | null; hidden: boolean; createdAt: string };

async function commentsOn(supabase: Supabase, clientId: string, day: string, coachingId?: string): Promise<DayComment[]> {
  let query = supabase
    .from("food_day_comments")
    .select("id, body, author_id, hidden_by_client_at, created_at")
    .eq("client_id", clientId)
    .eq("local_date", day)
    .order("created_at");
  if (coachingId) query = query.eq("coaching_id", coachingId);
  const { data, error } = await query;
  if (error) throw new Error(`loading the comments failed: ${error.code}`);
  const authorIds = [...new Set((data ?? []).map((row) => row.author_id).filter((id): id is string => Boolean(id)))];
  const people = new Map<string, Person>();
  if (authorIds.length) {
    const { data: rows } = await supabase.from("profiles").select("id, first_name, last_name, display_name").in("id", authorIds);
    for (const row of rows ?? []) people.set(row.id, row);
  }
  return (data ?? []).map((row) => ({
    id: row.id,
    body: row.body,
    authorId: row.author_id,
    authorName: row.author_id ? nameOf(people.get(row.author_id)) : "",
    hidden: row.hidden_by_client_at !== null,
    createdAt: row.created_at,
  }));
}

export type MyFoodDay = {
  today: string;
  day: string;
  entries: DiaryEntry[];
  target: DayTarget;
  comments: DayComment[];
  /** Meals that had entries the day before, for "Как вчера" (§3.7). */
  previousMeals: Meal[];
};

/** "Питание" of the signed-in client for a day (default today, in the client's time zone). Null when signed out. */
export async function loadMyFoodDay(requestedDay?: string | null): Promise<MyFoodDay | null> {
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  const me = session?.claims.sub;
  if (!me) return null;
  const { data: settings } = await supabase.from("user_settings").select("time_zone").eq("user_id", me).maybeSingle();
  const today = todayIn(settings?.time_zone ?? "Europe/Moscow");
  const day = isDay(requestedDay) && requestedDay <= today ? requestedDay : today;
  const previous = new Date(`${day}T00:00:00Z`);
  previous.setUTCDate(previous.getUTCDate() - 1);
  const previousDay = previous.toISOString().slice(0, 10);

  const [entries, target, comments, before] = await Promise.all([
    entriesOn(supabase, me, day),
    targetOn(supabase, me, day),
    commentsOn(supabase, me, day),
    supabase.from("food_diary_entries").select("meal").eq("client_id", me).eq("local_date", previousDay),
  ]);
  const meals = new Set((before.data ?? []).map((row) => row.meal));
  return { today, day, entries, target, comments, previousMeals: MEALS.filter((meal) => meals.has(meal)) };
}

export type PairFoodDay =
  | { state: "closed" }
  | { state: "open"; today: string; day: string; entries: DiaryEntry[]; target: DayTarget; comments: DayComment[]; me: string };

/** The client's day for the trainer's «Питание» tab: entries, the target and the trainer's own comments (§3.11). */
export async function loadPairFoodDay(coachingId: string, requestedDay?: string | null): Promise<PairFoodDay | null> {
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  const me = session?.claims.sub;
  if (!me) return null;
  const { data: pair, error } = await supabase.from("coachings").select("client_id, trainer_id, status").eq("id", coachingId).maybeSingle();
  if (error) throw new Error(`loading the pair failed: ${error.code}`);
  if (!pair || pair.trainer_id !== me) return null;
  const { data: shares } = await supabase.from("data_shares").select("nutrition").eq("coaching_id", coachingId).maybeSingle();
  if (!shares?.nutrition || (pair.status !== "trial" && pair.status !== "active")) return { state: "closed" };

  const { data: settings } = await supabase.from("user_settings").select("time_zone").eq("user_id", me).maybeSingle();
  const today = todayIn(settings?.time_zone ?? "Europe/Moscow");
  const day = isDay(requestedDay) && requestedDay <= today ? requestedDay : today;
  const [entries, target, comments] = await Promise.all([
    entriesOn(supabase, pair.client_id, day),
    targetOn(supabase, pair.client_id, day),
    commentsOn(supabase, pair.client_id, day, coachingId),
  ]);
  return { state: "open", today, day, entries, target, comments, me };
}

export type FoodShelf = { recent: Food[]; favorites: Food[]; own: Food[]; favoriteIds: string[] };

/** What "+ Еда" offers before a search (§3.7): recent foods, favorites and own products and dishes. */
export async function loadFoodShelf(): Promise<FoodShelf | null> {
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  const me = session?.claims.sub;
  if (!me) return null;
  const [recentRows, favoriteRows, ownRows] = await Promise.all([
    supabase
      .from("food_diary_entries")
      .select("food_id, logged_at")
      .eq("client_id", me)
      .not("food_id", "is", null)
      .order("logged_at", { ascending: false })
      .limit(60),
    supabase.from("food_favorites").select("food_id, created_at").order("created_at", { ascending: false }),
    supabase.from("foods").select("*").eq("owner_id", me).is("archived_at", null).order("name"),
  ]);
  for (const result of [recentRows, favoriteRows, ownRows]) {
    if (result.error) throw new Error(`loading foods failed: ${result.error.code}`);
  }
  const recentIds = [...new Set((recentRows.data ?? []).map((row) => row.food_id as string))].slice(0, 15);
  const favoriteIds = (favoriteRows.data ?? []).map((row) => row.food_id);
  const wanted = [...new Set([...recentIds, ...favoriteIds])];
  const foods = new Map<string, Food>();
  if (wanted.length) {
    const { data, error } = await supabase.from("foods").select("*").in("id", wanted).is("archived_at", null);
    if (error) throw new Error(`loading foods failed: ${error.code}`);
    for (const row of data ?? []) foods.set(row.id, toFood(row));
  }
  const pick = (ids: string[]) => ids.map((id) => foods.get(id)).filter((food): food is Food => Boolean(food));
  return { recent: pick(recentIds), favorites: pick(favoriteIds), own: (ownRows.data ?? []).map(toFood), favoriteIds };
}

/** One own food for editing; null when it is not the client's. */
export async function loadOwnFood(id: string): Promise<Food | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("foods").select("*").eq("id", id).eq("source", "custom").is("archived_at", null).maybeSingle();
  if (error) throw new Error(`loading the food failed: ${error.code}`);
  return data ? toFood(data) : null;
}
