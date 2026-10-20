import type { Metadata } from "next";
import { Suspense } from "react";
import { AddFood } from "@/components/nutrition/add-food";
import { FOOD_PATH } from "@/components/nutrition/paths";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { SkeletonRows } from "@/components/ui/skeleton";
import { getDictionary } from "@/i18n/server";
import { isMeal } from "@/lib/nutrition/diary";
import { loadFoodShelf } from "@/lib/nutrition/diary-load";
import { isDay } from "@/lib/passes/present";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.foodDiary.addScreen.title };
}

async function Add({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [search, shelf] = await Promise.all([searchParams, loadFoodShelf()]);
  if (!shelf) return null;
  const day = isDay(search.day) && search.day <= shelf.today ? search.day : shelf.today;
  const meal = isMeal(search.meal) ? search.meal : shelf.meal;
  // A new day or meal is a fresh screen: the kept state of the last visit (Activity) starts over.
  return <AddFood key={`${day}:${meal}`} day={day} initialMeal={meal} shelf={shelf} />;
}

/** "+ Еда" (wave-2 §3.2): `?day=&meal=` come from the diary day the person was on. */
export default async function AddFoodPage(props: PageProps<"/[lang]/client/diary/food/add">) {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.foodDiary.addScreen.title} back={{ fallbackHref: FOOD_PATH }} />}>
      <div className="flex w-full max-w-2xl flex-col gap-6 pt-4 md:pt-0">
        <Suspense fallback={<SkeletonRows rows={5} label={t.common.loading} />}>
          <Add searchParams={props.searchParams} />
        </Suspense>
      </div>
    </Screen>
  );
}
