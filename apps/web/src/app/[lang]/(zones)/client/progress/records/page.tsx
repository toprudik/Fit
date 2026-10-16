import type { Metadata } from "next";
import { Trophy } from "lucide-react";
import { Suspense } from "react";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonRows } from "@/components/ui/skeleton";
import { ClientRecords } from "@/components/workouts/records";
import { getDictionary } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.workouts.logs.recordsTitle };
}

/** All the client's records by exercise (PRD wave-1 §2.10-6, WORK-4). */
export default async function ClientRecordsPage() {
  const t = await getDictionary();
  const copy = t.workouts.logs;
  return (
    <Screen header={<ScreenHeader title={copy.recordsTitle} back={{ fallbackHref: "/client/progress" }} />}>
      <div className="flex w-full max-w-2xl flex-col gap-6 pt-4 md:pt-0">
        <Suspense fallback={<SkeletonRows rows={4} label={t.common.loading} />}>
          <ClientRecords empty={<EmptyState icon={Trophy} title={copy.recordsTitle} description={copy.recordsEmpty} />} />
        </Suspense>
      </div>
    </Screen>
  );
}
