import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { ReportDecision } from "@/components/admin/report-decision";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ListGroup, ListRow } from "@/components/ui/list";
import { SkeletonRows } from "@/components/ui/skeleton";
import { INTL_LOCALE } from "@/i18n/config";
import { interpolate } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import { personName, type PersonName } from "@/lib/admin/people";
import { REPORTS_QUEUE_FILTER } from "@/lib/admin/reports";
import { requireAdmin } from "@/lib/admin/require-admin";
import { isReportReason, isReportStatus, REPORT_TONE } from "@/lib/reports/reports";
import { isDisputeReason } from "@/lib/reviews/reviews";
import { showcasePath } from "@/lib/showcase/link";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.reports.admin.detailTitle };
}


async function Report({ params }: { params: PageProps<"/[lang]/admin/reports/[id]">["params"] }) {
  const [t, locale, { id }] = await Promise.all([getDictionary(), getLocale(), params]);
  const copy = t.reports.admin;
  const reportId = z.uuid().safeParse(id);
  if (!reportId.success) notFound();
  const { supabase, timeZone, userId } = await requireAdmin();
  const { data: report, error } = await supabase
    .from("reports")
    .select("id, target_type, target_id, target_owner_id, target_snapshot, reporter_id, reporter_contact, reason, body, status, resolution_note, resolved_at, resolved_by, created_at, appeal_of, appealed_by")
    .eq("id", reportId.data)
    .or(REPORTS_QUEUE_FILTER)
    .maybeSingle();
  if (error) throw new Error(`loading a report failed: ${error.code}`);
  if (!report || !isReportStatus(report.status)) notFound();

  const [{ data: original, error: originalError }, { data: showcase }] = await Promise.all([
    report.appeal_of
      ? supabase.from("reports").select("status, resolution_note, resolved_at, resolved_by").eq("id", report.appeal_of).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    report.target_type === "trainer_profile"
      ? supabase.from("trainer_profiles").select("slug").eq("user_id", report.target_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (originalError) throw new Error(`loading the appealed report failed: ${originalError.code}`);
  const ids = [report.reporter_id, report.target_owner_id].filter((value): value is string => Boolean(value));
  const { data: people, error: peopleError } = ids.length
    ? await supabase.from("profiles").select("id, first_name, last_name, username").in("id", ids)
    : { data: [], error: null };
  if (peopleError) throw new Error(`loading report people failed: ${peopleError.code}`);
  const person = (userId: string | null): PersonName | undefined => people.find((row) => row.id === userId);

  const date = new Intl.DateTimeFormat(INTL_LOCALE[locale], { dateStyle: "medium", timeStyle: "short", timeZone });
  const targets = t.reports.targets as Record<string, string>;
  const reason = isReportReason(report.reason)
    ? t.reports.reasons[report.reason]
    : isDisputeReason(report.reason)
      ? t.reviews.trainer.reasons[report.reason]
      : null;
  const appeal = report.appeal_of !== null;
  const sameAdmin = appeal && original?.resolved_by === userId;

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="report-content" className="flex flex-col gap-2">
        <h2 id="report-content" className="px-4 text-footnote text-ink-2">
          {copy.content}: {targets[report.target_type] ?? report.target_type}
        </h2>
        {report.target_snapshot ? (
          <div className="flex flex-col gap-1 rounded-lg bg-surface-1 p-4">
            <span className="text-footnote text-ink-2">{copy.snapshot}</span>
            <p className="text-body break-words whitespace-pre-wrap">{report.target_snapshot}</p>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-2 rounded-lg bg-surface-1 p-4">
            <p className="text-callout text-ink-2">{copy.noSnapshot}</p>
            {showcase?.slug ? (
              <Button asChild size="sm" variant="secondary">
                <Link href={showcasePath(showcase.slug)}>{copy.openShowcase}</Link>
              </Button>
            ) : null}
          </div>
        )}
      </section>

      <ListGroup header={appeal ? copy.appeal : copy.about}>
        {appeal ? null : <ListRow title={copy.reason} value={reason ?? report.reason} />}
        {appeal ? (
          <ListRow title={copy.appealedBy} value={report.appealed_by === report.reporter_id ? copy.appealedByReporter : copy.appealedByOwner} />
        ) : (
          <ListRow
            title={copy.reporter}
            value={report.reporter_id ? personName(person(report.reporter_id), copy.noName) : copy.anonymous}
            href={report.reporter_id ? `/admin/users/${report.reporter_id}` : undefined}
          />
        )}
        {report.reporter_contact ? <ListRow title={copy.contact} value={report.reporter_contact} /> : null}
        {report.target_owner_id ? (
          <ListRow
            title={copy.owner}
            value={personName(person(report.target_owner_id), copy.noName)}
            href={`/admin/users/${report.target_owner_id}`}
          />
        ) : null}
        <ListRow title={copy.sent} value={date.format(new Date(report.created_at))} />
        <ListRow title={copy.status} trailing={<Badge tone={REPORT_TONE[report.status]}>{t.reports.statuses[report.status]}</Badge>} />
      </ListGroup>

      {report.body ? (
        <section aria-labelledby="report-details" className="flex flex-col gap-2">
          <h2 id="report-details" className="px-4 text-footnote text-ink-2">
            {appeal ? copy.appealText : copy.details}
          </h2>
          <p className="rounded-lg bg-surface-1 p-4 text-body break-words whitespace-pre-wrap">{report.body}</p>
        </section>
      ) : null}

      {original && isReportStatus(original.status) ? (
        <ListGroup header={copy.original}>
          <ListRow title={copy.status} trailing={<Badge tone={REPORT_TONE[original.status]}>{t.reports.statuses[original.status]}</Badge>} />
          {original.resolution_note ? <ListRow title={copy.reason} subtitle={original.resolution_note} /> : null}
          {original.resolved_at ? <ListRow title={copy.sent} value={date.format(new Date(original.resolved_at))} /> : null}
        </ListGroup>
      ) : null}

      <section aria-labelledby="report-decision" className="flex flex-col gap-2">
        <h2 id="report-decision" className="px-4 text-footnote text-ink-2">
          {copy.decision}
        </h2>
        {report.status === "open" ? (
          sameAdmin ? (
            <p className="px-4 text-callout text-ink-2">{copy.sameAdmin}</p>
          ) : (
            <>
              <p className="px-4 text-callout text-ink-2">{appeal ? copy.appealDecisionText : copy.decisionText}</p>
              <ReportDecision reportId={report.id} appeal={appeal} />
            </>
          )
        ) : (
          <div className="flex flex-col gap-1 rounded-lg bg-surface-1 p-4">
            <p className="text-body">{t.reports.statuses[report.status]}</p>
            {report.resolution_note ? (
              <p className="text-subhead break-words whitespace-pre-wrap">{interpolate(t.reports.page.reason, { reason: report.resolution_note })}</p>
            ) : null}
            {report.resolved_at ? <span className="text-footnote text-ink-2">{date.format(new Date(report.resolved_at))}</span> : null}
          </div>
        )}
      </section>
    </div>
  );
}

/** One report or appeal (DSA arts. 17, 20): what was reported as the reporter saw it, who, why, and the decision. */
export default async function AdminReportPage({ params }: PageProps<"/[lang]/admin/reports/[id]">) {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.reports.admin.detailTitle} back={{ fallbackHref: "/admin/reports" }} />}>
      <Suspense fallback={<SkeletonRows rows={5} label={t.common.loading} />}>
        <Report params={params} />
      </Suspense>
    </Screen>
  );
}
