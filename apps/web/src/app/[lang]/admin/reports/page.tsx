import type { Metadata } from "next";
import { Flag } from "lucide-react";
import { Suspense } from "react";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { Badge } from "@/components/ui/badge";
import { Chip, ChipRow } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { ListGroup, ListRow } from "@/components/ui/list";
import { SkeletonRows } from "@/components/ui/skeleton";
import { INTL_LOCALE } from "@/i18n/config";
import { getDictionary, getLocale } from "@/i18n/server";
import { REPORTS_QUEUE_FILTER, reportsHref } from "@/lib/admin/reports";
import { requireAdmin } from "@/lib/admin/require-admin";
import { reviewExcerpt } from "@/lib/admin/reviews";
import { isReportReason, isReportStatus, REPORT_STATUSES, REPORT_TONE } from "@/lib/reports/reports";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.reports.admin.title };
}

const PAGE = 100;

async function Queue({ searchParams }: { searchParams: PageProps<"/[lang]/admin/reports">["searchParams"] }) {
  const [t, locale, { status: raw }] = await Promise.all([getDictionary(), getLocale(), searchParams]);
  const copy = t.reports.admin;
  // Open reports first by default: that is the queue someone has to answer.
  const status = raw === "all" ? null : isReportStatus(raw) ? raw : "open";
  const { supabase, timeZone } = await requireAdmin();
  let query = supabase
    .from("reports")
    .select("id, target_type, reason, status, created_at, appeal_of, target_snapshot")
    .or(REPORTS_QUEUE_FILTER)
    .order("created_at", { ascending: false })
    .limit(PAGE);
  if (status) query = query.eq("status", status);
  const { data: reports, error } = await query;
  if (error) throw new Error(`loading reports failed: ${error.code}`);
  const date = new Intl.DateTimeFormat(INTL_LOCALE[locale], { dateStyle: "medium", timeStyle: "short", timeZone });
  const targets = t.reports.targets as Record<string, string>;

  return (
    <div className="flex flex-col gap-4">
      <ChipRow label={copy.filters}>
        {REPORT_STATUSES.map((value) => (
          <Chip key={value} href={reportsHref(value)} selected={status === value}>
            {t.reports.statuses[value]}
          </Chip>
        ))}
        <Chip href={reportsHref(null)} selected={status === null}>
          {copy.all}
        </Chip>
      </ChipRow>
      {reports.length === 0 ? (
        <EmptyState icon={Flag} title={copy.emptyTitle} description={status === "open" ? copy.emptyOpen : copy.emptyText} />
      ) : (
        <ListGroup>
          {reports.map((report) => (
            <ListRow
              key={report.id}
              href={`/admin/reports/${report.id}`}
              title={<span className="line-clamp-2">{reviewExcerpt(report.target_snapshot) ?? targets[report.target_type] ?? report.target_type}</span>}
              subtitle={[
                report.appeal_of ? copy.appeal : (targets[report.target_type] ?? report.target_type),
                isReportReason(report.reason) ? t.reports.reasons[report.reason] : null,
                date.format(new Date(report.created_at)),
              ]
                .filter(Boolean)
                .join(", ")}
              trailing={isReportStatus(report.status) ? <Badge tone={REPORT_TONE[report.status]}>{t.reports.statuses[report.status]}</Badge> : undefined}
            />
          ))}
        </ListGroup>
      )}
    </div>
  );
}

/** "Жалобы" in /admin (DSA arts. 16, 17, 20): reports about replies, diary comments, challenge names and showcases. */
export default async function AdminReportsPage({ searchParams }: PageProps<"/[lang]/admin/reports">) {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.reports.admin.title} back={{ fallbackHref: "/admin" }} />}>
      <div className="flex flex-col gap-4">
        <p className="text-callout text-ink-2">{t.reports.admin.intro}</p>
        <Suspense fallback={<SkeletonRows rows={5} label={t.common.loading} />}>
          <Queue searchParams={searchParams} />
        </Suspense>
      </div>
    </Screen>
  );
}
