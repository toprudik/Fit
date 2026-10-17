import type { Metadata } from "next";
import { Suspense } from "react";
import { ClientMeasurements } from "@/components/progress/sections";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { SkeletonRows } from "@/components/ui/skeleton";
import { getDictionary } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.progress.measurements.title };
}

/** "Замеры": the chart and every entry with its author; the author edits own entries (PRD wave-1 §2.11-1). */
export default async function ClientMeasurementsPage() {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.progress.measurements.title} back={{ fallbackHref: "/client/progress" }} />}>
      <div className="flex w-full max-w-2xl flex-col gap-6 pt-4 md:pt-0">
        <Suspense fallback={<SkeletonRows rows={4} label={t.common.loading} />}>
          <ClientMeasurements full />
        </Suspense>
      </div>
    </Screen>
  );
}
