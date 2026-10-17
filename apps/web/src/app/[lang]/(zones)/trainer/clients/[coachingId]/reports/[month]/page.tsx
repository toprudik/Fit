import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SharedReportView } from "@/components/monthly-report/shared-report-view";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { SkeletonRows } from "@/components/ui/skeleton";
import { getDictionary } from "@/i18n/server";
import { monthFromParam } from "@/lib/monthly-report/report";
import { isPairId } from "@/lib/pairs/clients";

// A pair id and a month are known only at request time.
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.monthlyReport.shared.title };
}

type Params = PageProps<"/[lang]/trainer/clients/[coachingId]/reports/[month]">["params"];

async function Report({ params }: { params: Params }) {
  const { coachingId, month: param } = await params;
  const month = monthFromParam(param);
  if (!month || !isPairId(coachingId)) notFound();
  return <SharedReportView coachingId={coachingId} month={month} />;
}

async function Header({ params }: { params: Params }) {
  const [{ coachingId }, t] = await Promise.all([params, getDictionary()]);
  return <ScreenHeader title={t.monthlyReport.shared.title} back={{ fallbackHref: `/trainer/clients/${coachingId}` }} />;
}

/**
 * "Итоги клиента" (PRD wave-3 §4 rule 3, screens.md): the month a client sent to the trainer, opened from the
 * bot's message.
 */
export default async function TrainerSharedReportPage(props: PageProps<"/[lang]/trainer/clients/[coachingId]/reports/[month]">) {
  const t = await getDictionary();
  return (
    <Screen
      header={
        <Suspense fallback={<ScreenHeader title={t.monthlyReport.shared.title} />}>
          <Header params={props.params} />
        </Suspense>
      }
    >
      <div className="flex w-full max-w-2xl flex-col gap-6 pt-4 md:pt-0">
        <Suspense fallback={<SkeletonRows rows={4} label={t.common.loading} />}>
          <Report params={props.params} />
        </Suspense>
      </div>
    </Screen>
  );
}
