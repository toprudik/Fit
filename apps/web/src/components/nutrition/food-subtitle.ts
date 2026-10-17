import { interpolate } from "@/i18n/format";
import type { Dictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";
import type { Food } from "@/lib/nutrition/foods";
import { formatValue } from "@/lib/progress/measurements";

/** "250 ккал на 100 г" with the brand when there is one. Kept out of the client files so Server Components can call it. */
export function foodSubtitle(t: Dictionary, locale: Locale, food: Food): string {
  const copy = t.foodDiary.addScreen;
  const kcal = formatValue(locale, food.kcal100);
  if (food.kind === "dish") return `${copy.dish}, ${interpolate(copy.per100, { kcal })}`;
  return food.brand ? interpolate(copy.brandPer100, { brand: food.brand, kcal }) : interpolate(copy.per100, { kcal });
}
