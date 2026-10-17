import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { MonthlyReportView } from "@/components/monthly-report/report-view";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { SkeletonRows } from "@/components/ui/skeleton";
import { getDictionary } from "@/i18n/server";
import { monthFromParam } from "@/lib/monthly-report/report";

// The month is known only at request time, so the page renders on request instead of from a prerendered shell.
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.monthlyReport.title };
}

async function ReportFromParams({ params }: { params: PageProps<"/[lang]/client/progress/reports/[month]">["params"] }) {
  const month = monthFromParam((await params).month);
  if (!month) notFound();
  return <MonthlyReportView month={month} />;
}

/** "Итоги месяца" (PRD wave-3 §4): the client's finished month, pushed from "Прогресс" or the bot's message. */
export default async function MonthlyReportPage(props: PageProps<"/[lang]/client/progress/reports/[month]">) {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.monthlyReport.title} back={{ fallbackHref: "/client/progress" }} />}>
      <div className="flex w-full max-w-2xl flex-col gap-6 pt-4 md:pt-0">
        <Suspense fallback={<SkeletonRows rows={4} label={t.common.loading} />}>
          <ReportFromParams params={props.params} />
        </Suspense>
      </div>
    </Screen>
  );
}
