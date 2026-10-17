import { CalendarDays } from "lucide-react";
import { ListGroup, ListRow } from "@/components/ui/list";
import { interpolate } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import { loadLastMonthReport } from "@/lib/monthly-report/load";
import { formatMonth, monthParam } from "@/lib/monthly-report/report";

/** "Итоги месяца" on "Прогресс": last month's report, when that month had activity (PRD wave-3 §4). */
export async function MonthlyReportEntry() {
  const [t, locale, report] = await Promise.all([getDictionary(), getLocale(), loadLastMonthReport()]);
  if (!report) return null;
  const month = formatMonth(locale, report.month);
  return (
    <ListGroup>
      <ListRow
        icon={CalendarDays}
        iconTone="accent"
        title={t.monthlyReport.title}
        subtitle={interpolate(t.monthlyReport.entryText, { month: month.charAt(0).toLocaleUpperCase(locale) + month.slice(1) })}
        href={`/client/progress/reports/${monthParam(report.month)}`}
      />
    </ListGroup>
  );
}
