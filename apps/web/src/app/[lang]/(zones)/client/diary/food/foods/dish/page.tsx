import type { Metadata } from "next";
import { Suspense } from "react";
import { DishForm } from "@/components/nutrition/dish-form";
import { OWN_FOODS_PATH } from "@/components/nutrition/paths";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { SkeletonRows } from "@/components/ui/skeleton";
import { getDictionary } from "@/i18n/server";
import { loadFoodShelf } from "@/lib/nutrition/diary-load";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.foodDiary.dish.title };
}

async function NewDish() {
  const shelf = await loadFoodShelf();
  if (!shelf) return null;
  return <DishForm own={shelf.own} doneHref={OWN_FOODS_PATH} />;
}

/** "Новое блюдо" (wave-2 §3.2, §3.5). */
export default async function NewDishPage() {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.foodDiary.dish.title} back={{ fallbackHref: OWN_FOODS_PATH }} />}>
      <div className="flex w-full max-w-2xl flex-col gap-6 pt-4 md:pt-0">
        <Suspense fallback={<SkeletonRows rows={5} label={t.common.loading} />}>
          <NewDish />
        </Suspense>
      </div>
    </Screen>
  );
}
