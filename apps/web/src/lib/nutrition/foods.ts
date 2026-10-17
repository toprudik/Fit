import "server-only";
import { clientEnv } from "@/env/client";
import type { Locale } from "@/i18n/config";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { OFF_FIELDS, parseOffProduct, type OffCacheItem } from "./off-parse";

type FoodRow = Database["public"]["Tables"]["foods"]["Row"];

/** A food as the diary shows it: own product or dish, or a catalog product. */
export type Food = {
  id: string;
  source: "off" | "custom";
  kind: "product" | "dish";
  name: string;
  brand: string | null;
  barcode: string | null;
  kcal100: number;
  protein100: number | null;
  fat100: number | null;
  carbs100: number | null;
  servingG: number | null;
  servingLabel: string | null;
};

export const toFood = (row: FoodRow): Food => ({
  id: row.id,
  source: row.source,
  kind: row.kind,
  name: row.name,
  brand: row.brand,
  barcode: row.barcode,
  kcal100: Number(row.kcal_100g),
  protein100: row.protein_100g === null ? null : Number(row.protein_100g),
  fat100: row.fat_100g === null ? null : Number(row.fat_100g),
  carbs100: row.carbs_100g === null ? null : Number(row.carbs_100g),
  servingG: row.serving_g === null ? null : Number(row.serving_g),
  servingLabel: row.serving_label,
});

const SEARCH_URL = "https://search.openfoodfacts.org/search";
const PRODUCT_URL = "https://world.openfoodfacts.org/api/v2/product";
/** Open Food Facts asks every app to name itself (ADR 0012). */
const userAgent = () => `DaFit/1.0 (${clientEnv.NEXT_PUBLIC_APP_URL})`;
/** Past this the search answers from the cache and own foods (§3.5, §3.8). */
const OFF_TIMEOUT_MS = 4000;
/** A cached product older than this is fetched again on a barcode scan. */
const CACHE_DAYS = 30;

async function offJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { "User-Agent": userAgent(), Accept: "application/json" },
    signal: AbortSignal.timeout(OFF_TIMEOUT_MS),
    cache: "no-store",
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Open Food Facts answered ${response.status}`);
  return response.json();
}

/** Writes OFF products to the shared cache (server key: only cache rows) and returns their ids by code. */
async function cache(items: OffCacheItem[]): Promise<Map<string, string>> {
  if (!items.length) return new Map();
  const { data, error } = await createSupabaseAdminClient().rpc("cache_off_foods", { p_items: items });
  if (error) throw new Error(`caching Open Food Facts failed: ${error.code}`);
  return new Map((data ?? []).map((row) => [row.off_code, row.id]));
}

export type FoodSearch = { foods: Food[]; catalogDown: boolean };

/**
 * "Поиск" (§3.2): own foods first, then Open Food Facts in the interface language. When OFF does not answer, the
 * cached catalog and own foods still come up and the screen says the catalog is unavailable (§3.8).
 */
export async function searchFoods(query: string, locale: Locale): Promise<FoodSearch> {
  const q = query.trim().slice(0, 100);
  if (q.length < 2) return { foods: [], catalogDown: false };
  const supabase = await createSupabaseServerClient();

  let offIds: string[] = [];
  let catalogDown = false;
  try {
    const params = new URLSearchParams({ q, langs: locale, page_size: "20", fields: OFF_FIELDS(locale) });
    const body = (await offJson(`${SEARCH_URL}?${params}`)) as { hits?: unknown[] } | null;
    const items = (body?.hits ?? []).map((hit) => parseOffProduct(hit, locale)).filter((item) => item !== null);
    const ids = await cache(items);
    offIds = items.map((item) => ids.get(item.code)).filter((id): id is string => Boolean(id));
  } catch (error) {
    console.error("Open Food Facts search failed", error instanceof Error ? error.message : "unknown");
    catalogDown = true;
  }

  const { data: local, error } = await supabase.rpc("search_foods", { p_query: q, p_limit: 20 });
  if (error) throw new Error(`searching foods failed: ${error.code}`);
  const own = (local ?? []).filter((row) => row.source === "custom");
  let catalog: FoodRow[];
  if (catalogDown) {
    catalog = (local ?? []).filter((row) => row.source === "off");
  } else if (offIds.length) {
    const { data, error: catalogError } = await supabase.from("foods").select("*").in("id", offIds);
    if (catalogError) throw new Error(`loading catalog foods failed: ${catalogError.code}`);
    const byId = new Map((data ?? []).map((row) => [row.id, row]));
    catalog = offIds.map((id) => byId.get(id)).filter((row): row is FoodRow => Boolean(row));
  } else {
    catalog = [];
  }
  return { foods: [...own, ...catalog].map(toFood), catalogDown };
}

export type BarcodeLookup = { food: Food | null; catalogDown: boolean };

/** A scanned or typed barcode (§3.2–3.3): own product, then the cache, then Open Food Facts. */
export async function foodByBarcode(barcode: string, locale: Locale): Promise<BarcodeLookup> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("food_by_barcode", { p_barcode: barcode }).maybeSingle();
  if (error) throw new Error(`looking up the barcode failed: ${error.code}`);
  const fresh =
    data && (data.source === "custom" || (data.off_fetched_at && Date.now() - Date.parse(data.off_fetched_at) < CACHE_DAYS * 86_400_000));
  if (data && fresh) return { food: toFood(data), catalogDown: false };

  try {
    const body = (await offJson(`${PRODUCT_URL}/${barcode}.json?fields=${OFF_FIELDS(locale)}`)) as { status?: number; product?: unknown } | null;
    const item = body?.status === 1 ? parseOffProduct({ code: barcode, ...(body.product as object) }, locale) : null;
    if (!item) return { food: data ? toFood(data) : null, catalogDown: false };
    const id = (await cache([item])).get(item.code);
    const { data: row } = id ? await supabase.from("foods").select("*").eq("id", id).maybeSingle() : { data: null };
    return { food: row ? toFood(row) : data ? toFood(data) : null, catalogDown: false };
  } catch (error) {
    console.error("Open Food Facts product lookup failed", error instanceof Error ? error.message : "unknown");
    return { food: data ? toFood(data) : null, catalogDown: true };
  }
}
