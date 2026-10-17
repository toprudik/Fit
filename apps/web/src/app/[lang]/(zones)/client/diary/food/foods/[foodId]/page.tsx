import type { Metadata } from "next";
import { SearchX } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { z } from "zod";
import { foodSubtitle } from "@/components/nutrition/food-subtitle";
import { OWN_FOODS_PATH } from "@/components/nutrition/paths";
import { ArchiveFoodButton, ProductForm } from "@/components/nutrition/product-form";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ListGroup, ListRow } from "@/components/ui/list";
import { SkeletonRows } from "@/components/ui/skeleton";
import { getDictionary, getLocale } from "@/i18n/server";
import { loadOwnFood } from "@/lib/nutrition/diary-load";

// A food id is known only at request time, so the page renders on request.
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.foodDiary.foods.editProduct };
}

type Props = PageProps<"/[lang]/client/diary/food/foods/[foodId]">;

async function OwnFood({ params }: Pick<Props, "params">) {
  const [t, locale, { foodId }] = await Promise.all([getDictionary(), getLocale(), params]);
  const copy = t.foodDiary.foods;
  const id = z.uuid().safeParse(foodId);
  const food = id.success ? await loadOwnFood(id.data) : null;
  if (!food) {
    return (
      <EmptyState
        icon={SearchX}
        title={copy.notFound}
        description={copy.notFoundText}
        action={
          <Button asChild variant="secondary">
            <Link href={OWN_FOODS_PATH}>{copy.back}</Link>
          </Button>
        }
      />
    );
  }
  if (food.kind === "dish") {
    // A dish is fixed once saved: its values went into past entries; a changed recipe is a new dish.
    return (
      <div className="flex flex-col gap-6">
        <ListGroup>
          <ListRow title={food.name} subtitle={foodSubtitle(t, locale, food)} />
        </ListGroup>
        <ArchiveFoodButton id={food.id} />
      </div>
    );
  }
  return <ProductForm food={food} barcode="" doneHref={OWN_FOODS_PATH} />;
}

/** One own product to edit, or a dish to delete (wave-2 §3.10). */
export default async function OwnFoodPage(props: Props) {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.foodDiary.foods.editProduct} back={{ fallbackHref: OWN_FOODS_PATH }} />}>
      <div className="flex w-full max-w-2xl flex-col gap-6 pt-4 md:pt-0">
        <Suspense fallback={<SkeletonRows rows={5} label={t.common.loading} />}>
          <OwnFood params={props.params} />
        </Suspense>
      </div>
    </Screen>
  );
}
