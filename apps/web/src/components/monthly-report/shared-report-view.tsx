import { CalendarDays } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { interpolate } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import { loadSharedReport } from "@/lib/monthly-report/load";
import { formatMonth } from "@/lib/monthly-report/report";
import { formatPlanDate } from "@/lib/plans/plans";
import { ReportSections } from "./report-view";

/** The month a client sent to this trainer (PRD wave-3 §4 rule 3), as it was when they sent it. */
export async function SharedReportView({ coachingId, month }: { coachingId: string; month: string }) {
  const [t, locale, shared] = await Promise.all([getDictionary(), getLocale(), loadSharedReport(coachingId, month)]);
  const copy = t.monthlyReport;
  if (shared === "signed-out") return <EmptyState icon={CalendarDays} title={copy.shared.title} description={copy.signedOutText} />;
  if (!shared) return <EmptyState icon={CalendarDays} title={copy.shared.emptyTitle} description={copy.shared.emptyText} />;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1 px-4">
        <h2 className="text-title-3 font-semibold first-letter:uppercase">{formatMonth(locale, shared.report.month)}</h2>
        <p className="text-footnote text-ink-2">
          {interpolate(copy.shared.sentAt, { date: formatPlanDate(locale, shared.sharedAt, shared.timeZone) })}
        </p>
      </div>
      <ReportSections report={shared.report} t={t} locale={locale} />
    </div>
  );
}
