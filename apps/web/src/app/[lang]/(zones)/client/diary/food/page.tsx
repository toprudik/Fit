import type { Metadata } from "next";
import { Suspense } from "react";
import { ClientFoodDay } from "@/components/nutrition/food-day";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { SkeletonRows } from "@/components/ui/skeleton";
import { getDictionary } from "@/i18n/server";
import { isDay } from "@/lib/passes/present";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.foodDiary.title };
}

async function Day({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const search = await searchParams;
  return <ClientFoodDay day={isDay(search.day) ? search.day : null} />;
}

/** "Питание": one day of the food diary, `?day=` for another day (wave-2 §3). */
export default async function FoodDiaryPage(props: PageProps<"/[lang]/client/diary/food">) {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.foodDiary.title} back={{ fallbackHref: "/client/diary" }} />}>
      <div className="flex w-full max-w-2xl flex-col gap-6 pt-4 md:pt-0">
        <Suspense fallback={<SkeletonRows rows={5} label={t.common.loading} />}>
          <Day searchParams={props.searchParams} />
        </Suspense>
      </div>
    </Screen>
  );
}
