import type { Metadata } from "next";
import { ChartLine } from "lucide-react";
import { Suspense } from "react";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonRows } from "@/components/ui/skeleton";
import { ClientRecords } from "@/components/workouts/records";
import { getDictionary } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.tabs.client.progress };
}

/** "Прогресс": for now the records from the workout logs; measurements and photos come later. */
export default async function ClientProgressPage() {
  const t = await getDictionary();
  const copy = t.screens.client.progress;
  return (
    <Screen header={<ScreenHeader title={t.tabs.client.progress} />}>
      <div className="flex w-full max-w-2xl flex-col gap-6 pt-4 md:pt-0">
        <Suspense fallback={<SkeletonRows rows={3} label={t.common.loading} />}>
          <ClientRecords limit={5} empty={<EmptyState icon={ChartLine} title={copy.emptyTitle} description={copy.emptyText} />} />
        </Suspense>
      </div>
    </Screen>
  );
}
