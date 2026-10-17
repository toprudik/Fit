import type { Metadata } from "next";
import { CookingPot, Plus } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { foodSubtitle } from "@/components/nutrition/add-food";
import { ADD_FOOD_PATH, OWN_FOODS_PATH } from "@/components/nutrition/paths";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ListGroup, ListRow } from "@/components/ui/list";
import { SkeletonRows } from "@/components/ui/skeleton";
import { getDictionary, getLocale } from "@/i18n/server";
import { loadFoodShelf } from "@/lib/nutrition/diary-load";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.foodDiary.foods.title };
}

async function OwnFoods() {
  const [t, locale, shelf] = await Promise.all([getDictionary(), getLocale(), loadFoodShelf()]);
  if (!shelf) return null;
  const copy = t.foodDiary.foods;
  const actions = (
    <div className="flex flex-wrap gap-3">
      <Button asChild icon={Plus}>
        <Link href={`${OWN_FOODS_PATH}/new`}>{copy.newProduct}</Link>
      </Button>
      <Button asChild variant="secondary" icon={CookingPot}>
        <Link href={`${OWN_FOODS_PATH}/dish`}>{copy.newDish}</Link>
      </Button>
    </div>
  );
  if (!shelf.own.length) {
    return <EmptyState icon={CookingPot} title={copy.empty} description={copy.emptyText} action={actions} />;
  }
  return (
    <div className="flex flex-col gap-6">
      {actions}
      <ListGroup>
        {shelf.own.map((food) => (
          <ListRow key={food.id} title={food.name} subtitle={foodSubtitle(t, locale, food)} href={`${OWN_FOODS_PATH}/${food.id}`} chevron />
        ))}
      </ListGroup>
    </div>
  );
}

/** "Мои продукты": own products and dishes, for the diary and the trainer's plans later (wave-2 §3.2, §3.10). */
export default async function OwnFoodsPage() {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.foodDiary.foods.title} back={{ fallbackHref: ADD_FOOD_PATH }} />}>
      <div className="flex w-full max-w-2xl flex-col gap-6 pt-4 md:pt-0">
        <Suspense fallback={<SkeletonRows rows={4} label={t.common.loading} />}>
          <OwnFoods />
        </Suspense>
      </div>
    </Screen>
  );
}
