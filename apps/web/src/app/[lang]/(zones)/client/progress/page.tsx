import type { Metadata } from "next";
import { Suspense } from "react";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { SkeletonRows } from "@/components/ui/skeleton";
import { ClientNutritionEntry } from "@/components/nutrition/sections";
import { ClientPhotos } from "@/components/progress/photo-sections";
import { ClientMeasurements, ClientMilestones } from "@/components/progress/sections";
import { ClientRecords } from "@/components/workouts/records";
import { getDictionary } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.tabs.client.progress };
}

/** "Прогресс": measurements, the goal and nutrition target, the latest photos, milestones and the records from the workout logs. */
export default async function ClientProgressPage() {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.tabs.client.progress} />}>
      <div className="flex w-full max-w-2xl flex-col gap-6 pt-4 md:pt-0">
        <Suspense fallback={<SkeletonRows rows={3} label={t.common.loading} />}>
          <ClientMeasurements />
        </Suspense>
        <Suspense fallback={<SkeletonRows rows={1} label={t.common.loading} />}>
          <ClientNutritionEntry />
        </Suspense>
        <Suspense fallback={<SkeletonRows rows={2} label={t.common.loading} />}>
          <ClientPhotos />
        </Suspense>
        <Suspense fallback={null}>
          <ClientMilestones />
        </Suspense>
        <Suspense fallback={<SkeletonRows rows={3} label={t.common.loading} />}>
          <ClientRecords limit={5} empty={null} />
        </Suspense>
      </div>
    </Screen>
  );
}
