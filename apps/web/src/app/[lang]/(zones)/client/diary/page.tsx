import type { Metadata } from "next";
import { Suspense } from "react";
import { ActivityDiaryEntry } from "@/components/activity/sections";
import { FoodDiaryEntry } from "@/components/nutrition/food-day";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { SkeletonRows } from "@/components/ui/skeleton";
import { LogListSection } from "@/components/workouts/log-screens";
import { getDictionary } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.tabs.client.diary };
}

/** "Дневник": the food diary and activity entries (wave-2 §3, §4) and the client's workout logs, own and from the trainer (PRD wave-1 §2.10-4). */
export default async function ClientDiaryPage() {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.tabs.client.diary} />}>
      <div className="flex w-full max-w-2xl flex-col gap-6 pt-4 md:pt-0">
        <FoodDiaryEntry t={t} />
        <ActivityDiaryEntry t={t} />
        <Suspense fallback={<SkeletonRows rows={4} label={t.common.loading} />}>
          <LogListSection place={{ side: "client" }} />
        </Suspense>
      </div>
    </Screen>
  );
}
