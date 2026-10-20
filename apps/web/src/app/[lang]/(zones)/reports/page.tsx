import type { Metadata } from "next";
import { Flag } from "lucide-react";
import { Suspense } from "react";
import { AppealButton } from "@/components/reports/appeal-button";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonRows } from "@/components/ui/skeleton";
import { INTL_LOCALE } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { interpolate } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import { canAppeal, isReportReason, isReportStatus, REPORT_TONE, type ReportStatus } from "@/lib/reports/reports";
import { isDisputeReason } from "@/lib/reviews/reviews";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DEFAULT_TIME_ZONE } from "@/lib/plans/plans";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.reports.page.title };
}

type Entry = {
  id: string;
  targetType: string;
  reason: string | null;
  status: ReportStatus;
  note: string | null;
  at: string;
  appealable: boolean;
  appealed: boolean;
};

function reasonLabel(t: Dictionary, reason: string | null): string | null {
  if (!reason) return null;
  if (isReportReason(reason)) return t.reports.reasons[reason];
  if (isDisputeReason(reason)) return t.reviews.trainer.reasons[reason];
  return null;
}

function EntryCard({ t, entry, date }: { t: Dictionary; entry: Entry; date: Intl.DateTimeFormat }) {
  const copy = t.reports;
  const target = (copy.targets as Record<string, string>)[entry.targetType] ?? entry.targetType;
  const reason = reasonLabel(t, entry.reason);
  return (
    <article className="flex flex-col items-start gap-2 rounded-lg bg-surface-1 p-4">
      <div className="flex w-full items-start justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-body">{target}</span>
          <span className="text-footnote text-ink-2">{[reason, date.format(new Date(entry.at))].filter(Boolean).join(", ")}</span>
        </div>
        <Badge tone={REPORT_TONE[entry.status]}>{copy.statuses[entry.status]}</Badge>
      </div>
      {entry.note ? <p className="text-subhead break-words whitespace-pre-wrap">{interpolate(copy.page.reason, { reason: entry.note })}</p> : null}
      {entry.appealed ? (
        <span className="text-footnote text-ink-2">{copy.page.appealed}</span>
      ) : entry.appealable ? (
        <AppealButton reportId={entry.id} />
      ) : null}
    </article>
  );
}

async function Lists() {
  const [t, locale] = await Promise.all([getDictionary(), getLocale()]);
  const copy = t.reports.page;
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  const me = session?.claims.sub;
  if (!me) return <EmptyState icon={Flag} title={copy.empty} description={copy.emptyText} />;

  const [mine, aboutMe, settings] = await Promise.all([
    supabase
      .from("reports")
      .select("id, target_type, reason, status, resolution_note, resolved_at, created_at, appeal_of")
      .eq("reporter_id", me)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.rpc("my_report_decisions"),
    supabase.from("user_settings").select("time_zone").eq("user_id", me).maybeSingle(),
  ]);
  if (mine.error) throw new Error(`loading my reports failed: ${mine.error.code}`);
  if (aboutMe.error) throw new Error(`loading decisions about me failed: ${aboutMe.error.code}`);

  // My own appeals come back as rows linked by appeal_of; the author's appeals stay with the admins.
  const appealedIds = new Set(mine.data.flatMap((row) => (row.appeal_of ? [row.appeal_of] : [])));
  const reported: Entry[] = mine.data.flatMap((row) => {
    if (row.appeal_of || !isReportStatus(row.status)) return [];
    const appealed = appealedIds.has(row.id);
    const decided = { status: row.status, resolvedAt: row.resolved_at, appealed };
    return [
      {
        id: row.id,
        targetType: row.target_type,
        reason: row.reason,
        status: row.status,
        note: row.resolution_note,
        at: row.created_at,
        appealed,
        // A dismissed dispute about a review is final (wave-2 §11 rule 7).
        appealable: canAppeal(decided) && !(row.target_type === "review" && row.status === "dismissed"),
      },
    ];
  });
  const decisions: Entry[] = aboutMe.data.flatMap((row) => {
    if (!isReportStatus(row.status)) return [];
    return [
      {
        id: row.report_id,
        targetType: row.target_type,
        reason: null,
        status: row.status,
        note: row.resolution_note,
        at: row.resolved_at,
        appealed: row.appealed,
        appealable: canAppeal({ status: row.status, resolvedAt: row.resolved_at, appealed: row.appealed }),
      },
    ];
  });
  if (!reported.length && !decisions.length) return <EmptyState icon={Flag} title={copy.empty} description={copy.emptyText} />;

  const date = new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    dateStyle: "medium",
    timeZone: settings.data?.time_zone ?? DEFAULT_TIME_ZONE,
  });
  const section = (id: string, title: string, entries: Entry[]) =>
    entries.length ? (
      <section aria-labelledby={id} className="flex flex-col gap-2">
        <h2 id={id} className="px-4 text-footnote text-ink-2">
          {title}
        </h2>
        {entries.map((entry) => (
          <EntryCard key={entry.id} t={t} entry={entry} date={date} />
        ))}
      </section>
    ) : null;
  return (
    <div className="flex flex-col gap-6">
      {section("reports-about-me", copy.aboutMe, decisions)}
      {section("reports-mine", copy.mine, reported)}
    </div>
  );
}

/**
 * "Жалобы" (DSA arts. 17, 20): the person's reports with their status and reason, the decisions about what they
 * wrote, and "Обжаловать" for six months after a decision. Opened from the bot's report notices; belongs to no zone.
 */
export default async function ReportsPage() {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.reports.page.title} back={{ fallbackHref: "/" }} />}>
      <div className="flex w-full max-w-2xl flex-col gap-4 pt-4 md:pt-0">
        <p className="px-1 text-callout text-ink-2">{t.reports.page.intro}</p>
        <Suspense fallback={<SkeletonRows rows={4} label={t.common.loading} />}>
          <Lists />
        </Suspense>
      </div>
    </Screen>
  );
}
