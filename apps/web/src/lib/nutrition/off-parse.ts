/**
 * Open Food Facts products as DaFit caches them (wave-2 §3.5, ADR 0012): the name in the interface language when
 * OFF has it, kcal and macros per 100 g, the serving when OFF gives one in grams. Products without kcal are not
 * cached: the diary cannot count them. They come up as drafts with a "no nutrition facts" note instead, and the
 * client adds one by typing kcal from the package into an own product (wave-2 §3.8).
 */

/** What public.cache_off_foods takes for one product. */
export type OffCacheItem = {
  code: string;
  name: string;
  brand: string | null;
  kcal: number;
  protein: number | null;
  fat: number | null;
  carbs: number | null;
  serving_g: number | null;
  serving_label: string | null;
  lang: string | null;
};

/** A catalog product OFF knows without kcal: what prefills an own product. */
export type OffDraft = { code: string; name: string; brand: string | null };

/** The fields asked from Open Food Facts, for both the search and the product lookup. */
export const OFF_FIELDS = (lang: string) =>
  ["code", "product_name", `product_name_${lang}`, "brands", "nutriments", "serving_quantity", "serving_size", "lang"].join(",");

const KJ_PER_KCAL = 4.184;

function number(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value.replace(",", ".")) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

const tenth = (value: number) => Math.round(value * 10) / 10;

function text(value: unknown): string | null {
  if (Array.isArray(value)) return text(value.find((part) => typeof part === "string" && part.trim()));
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function nameAndCode(product: Record<string, unknown>, lang: string) {
  const code = text(product.code);
  const localName = text(product[`product_name_${lang}`]);
  const name = localName ?? text(product.product_name);
  return code && code.length <= 40 && name ? { code, localName, name } : null;
}

const brandOf = (product: Record<string, unknown>) => text(product.brands)?.split(",")[0]?.trim().slice(0, 200) ?? null;

/** The kcal per 100 g OFF gives, from kcal or kJ; null when it gives neither. */
function kcalOf(product: Record<string, unknown>): number | null {
  const nutriments = (product.nutriments ?? {}) as Record<string, unknown>;
  const kj = number(nutriments["energy-kj_100g"]);
  return number(nutriments["energy-kcal_100g"]) ?? (kj === null ? null : kj / KJ_PER_KCAL);
}

/** One OFF product, from the search or from /api/v2/product, in the language asked; null when it cannot be logged. */
export function parseOffProduct(raw: unknown, lang: string): OffCacheItem | null {
  if (!raw || typeof raw !== "object") return null;
  const product = raw as Record<string, unknown>;
  const named = nameAndCode(product, lang);
  if (!named) return null;
  const { code, localName, name } = named;

  const nutriments = (product.nutriments ?? {}) as Record<string, unknown>;
  const kcalRaw = kcalOf(product);
  if (kcalRaw === null || kcalRaw < 0 || kcalRaw > 900) return null;
  const macro = (key: string) => {
    const value = number(nutriments[key]);
    return value === null || value < 0 || value > 100 ? null : tenth(value);
  };
  const protein = macro("proteins_100g");
  const fat = macro("fat_100g");
  const carbs = macro("carbohydrates_100g");
  if ((protein ?? 0) + (fat ?? 0) + (carbs ?? 0) > 100) return null;

  const servingG = number(product.serving_quantity);
  const serving = servingG !== null && servingG > 0 && servingG <= 5000 ? tenth(servingG) : null;
  return {
    code,
    name: name.slice(0, 200),
    brand: brandOf(product),
    kcal: tenth(kcalRaw),
    protein,
    fat,
    carbs,
    serving_g: serving,
    serving_label: serving === null ? null : (text(product.serving_size)?.slice(0, 80) ?? null),
    lang: localName ? lang : (text(product.lang)?.slice(0, 8) ?? null),
  };
}

/**
 * Products named in the interface language first, in the order OFF ranked them; the rest keep their own names
 * after them. A Russian search then starts with Russian names, and brands like "Coca-Cola" still come up.
 */
export function localNamesFirst<T extends { lang: string | null }>(items: T[], lang: string): T[] {
  return [...items.filter((item) => item.lang === lang), ...items.filter((item) => item.lang !== lang)];
}

/** An OFF product with a name but no kcal at all; null for anything else, including products parseOffProduct takes. */
export function parseOffDraft(raw: unknown, lang: string): OffDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const product = raw as Record<string, unknown>;
  const named = nameAndCode(product, lang);
  if (!named || kcalOf(product) !== null) return null;
  return { code: named.code, name: named.name.slice(0, 200), brand: brandOf(product) };
}

/** EAN-13, EAN-8, UPC-A (12) or the 14-digit GTIN: digits only (§3.2). */
export function normalizeBarcode(value: string): string | null {
  const digits = value.replace(/[\s-]/g, "");
  return /^[0-9]{8,14}$/.test(digits) ? digits : null;
}
