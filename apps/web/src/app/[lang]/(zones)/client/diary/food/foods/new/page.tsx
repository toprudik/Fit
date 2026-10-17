import type { Metadata } from "next";
import { Suspense } from "react";
import { ADD_FOOD_PATH, OWN_FOODS_PATH } from "@/components/nutrition/paths";
import { ProductForm } from "@/components/nutrition/product-form";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { SkeletonRows } from "@/components/ui/skeleton";
import { getDictionary } from "@/i18n/server";
import { isMeal } from "@/lib/nutrition/diary";
import { normalizeBarcode } from "@/lib/nutrition/off-parse";
import { isDay } from "@/lib/passes/present";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.foodDiary.foods.newProduct };
}

async function NewProduct({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const search = await searchParams;
  const barcode = typeof search.barcode === "string" ? (normalizeBarcode(search.barcode) ?? "") : "";
  // Created from "+ Еда" (a barcode the catalog did not know): back there, to the same day and meal.
  const fromDiary = isDay(search.day) && isMeal(search.meal);
  const doneHref = fromDiary ? `${ADD_FOOD_PATH}?day=${search.day}&meal=${search.meal}` : OWN_FOODS_PATH;
  return <ProductForm food={null} barcode={barcode} doneHref={doneHref} />;
}

/** "Новый продукт": `?barcode=&day=&meal=` when it comes from a barcode that was not found (wave-2 §3.4). */
export default async function NewProductPage(props: PageProps<"/[lang]/client/diary/food/foods/new">) {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.foodDiary.foods.newProduct} back={{ fallbackHref: OWN_FOODS_PATH }} />}>
      <div className="flex w-full max-w-2xl flex-col gap-6 pt-4 md:pt-0">
        <Suspense fallback={<SkeletonRows rows={5} label={t.common.loading} />}>
          <NewProduct searchParams={props.searchParams} />
        </Suspense>
      </div>
    </Screen>
  );
}
