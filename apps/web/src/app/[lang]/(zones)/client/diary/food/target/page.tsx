import type { Metadata } from "next";
import { Suspense } from "react";
import { ClientNutrition } from "@/components/nutrition/sections";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { SkeletonRows } from "@/components/ui/skeleton";
import { getDictionary } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.nutrition.title };
}

/** "Цель и норма": the target in force, the pick between trainers' targets and the calculator (wave-2 §1–2). */
export default async function NutritionTargetPage() {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.nutrition.title} back={{ fallbackHref: "/client/progress" }} />}>
      <div className="flex w-full max-w-2xl flex-col gap-6 pt-4 md:pt-0">
        <Suspense fallback={<SkeletonRows rows={4} label={t.common.loading} />}>
          <ClientNutrition />
        </Suspense>
      </div>
    </Screen>
  );
}
