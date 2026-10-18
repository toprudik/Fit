import type { Metadata } from "next";
import { Star } from "lucide-react";
import { Suspense } from "react";
import { Stars } from "@/components/reviews/stars";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { Badge } from "@/components/ui/badge";
import { Chip, ChipRow } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { ListGroup, ListRow } from "@/components/ui/list";
import { SkeletonRows } from "@/components/ui/skeleton";
import { INTL_LOCALE } from "@/i18n/config";
import { interpolate } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import { personName } from "@/lib/admin/people";
import { requireAdmin } from "@/lib/admin/require-admin";
import { DISPUTE_STATUSES, DISPUTE_TONE, disputesHref, isDisputeStatus, reviewExcerpt } from "@/lib/admin/reviews";
import { isDisputeReason } from "@/lib/reviews/reviews";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.adminReviews.title };
}

const PAGE = 100;

async function Queue({ searchParams }: { searchParams: PageProps<"/[lang]/admin/reviews">["searchParams"] }) {
  const [t, locale, { status: raw }] = await Promise.all([getDictionary(), getLocale(), searchParams]);
  const copy = t.adminReviews;
  // Open disputes first by default: that is the queue someone has to answer.
  const status = raw === "all" ? null : isDisputeStatus(raw) ? raw : "open";
  const { supabase, timeZone } = await requireAdmin();
  let query = supabase
    .from("reports")
    .select("id, target_id, reason, status, created_at, reporter:profiles!reports_reporter_id_fkey(first_name, last_name, username)")
    .eq("target_type", "review")
    .order("created_at", { ascending: false })
    .limit(PAGE);
  if (status) query = query.eq("status", status);
  const { data: reports, error } = await query;
  if (error) throw new Error(`loading review disputes failed: ${error.code}`);

  const reviewIds = [...new Set(reports.map((report) => report.target_id))];
  const { data: reviews, error: reviewsError } = reviewIds.length
    ? await supabase.from("reviews").select("id, rating, body").in("id", reviewIds)
    : { data: [], error: null };
  if (reviewsError) throw new Error(`loading reviews failed: ${reviewsError.code}`);
  const reviewById = new Map(reviews.map((review) => [review.id, review]));
  const date = new Intl.DateTimeFormat(INTL_LOCALE[locale], { dateStyle: "medium", timeStyle: "short", timeZone });

  return (
    <div className="flex flex-col gap-4">
      <ChipRow label={copy.filters}>
        {DISPUTE_STATUSES.map((value) => (
          <Chip key={value} href={disputesHref(value)} selected={status === value}>
            {copy.filterStatuses[value]}
          </Chip>
        ))}
        <Chip href={disputesHref(null)} selected={status === null}>
          {copy.all}
        </Chip>
      </ChipRow>
      {reports.length === 0 ? (
        <EmptyState icon={Star} title={copy.emptyTitle} description={status === "open" ? copy.emptyOpen : copy.emptyText} />
      ) : (
        <ListGroup>
          {reports.map((report) => {
            const review = reviewById.get(report.target_id);
            return (
              <ListRow
                key={report.id}
                href={`/admin/reviews/${report.id}`}
                leading={
                  review ? <Stars rating={review.rating} label={interpolate(t.reviews.ratingLabel, { n: review.rating })} /> : undefined
                }
                title={<span className="line-clamp-2">{review ? (reviewExcerpt(review.body) ?? copy.noText) : copy.reviewGone}</span>}
                subtitle={[
                  isDisputeReason(report.reason) ? t.reviews.trainer.reasons[report.reason] : report.reason,
                  report.reporter ? personName(report.reporter, copy.noName) : copy.deleted,
                  date.format(new Date(report.created_at)),
                ].join(" · ")}
                trailing={<Badge tone={DISPUTE_TONE[report.status]}>{copy.statuses[report.status]}</Badge>}
              />
            );
          })}
        </ListGroup>
      )}
    </div>
  );
}

/** "Отзывы" in /admin (wave-2 §11 rule 7): the trainers' disputes about reviews, open ones first. */
export default async function AdminReviewsPage({ searchParams }: PageProps<"/[lang]/admin/reviews">) {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.adminReviews.title} back={{ fallbackHref: "/admin" }} />}>
      <div className="flex flex-col gap-4">
        <p className="text-callout text-ink-2">{t.adminReviews.intro}</p>
        <Suspense fallback={<SkeletonRows rows={5} label={t.common.loading} />}>
          <Queue searchParams={searchParams} />
        </Suspense>
      </div>
    </Screen>
  );
}
