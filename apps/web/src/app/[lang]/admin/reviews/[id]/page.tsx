import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { ReviewDecision } from "@/components/admin/review-decision";
import { Stars } from "@/components/reviews/stars";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { Badge } from "@/components/ui/badge";
import { ListGroup, ListRow } from "@/components/ui/list";
import { SkeletonRows } from "@/components/ui/skeleton";
import { INTL_LOCALE } from "@/i18n/config";
import { interpolate } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import { personName, type PersonName } from "@/lib/admin/people";
import { requireAdmin } from "@/lib/admin/require-admin";
import { DISPUTE_TONE } from "@/lib/admin/reviews";
import { isDisputeReason } from "@/lib/reviews/reviews";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.adminReviews.detailTitle };
}

async function Dispute({ params }: { params: PageProps<"/[lang]/admin/reviews/[id]">["params"] }) {
  const [t, locale, { id }] = await Promise.all([getDictionary(), getLocale(), params]);
  const copy = t.adminReviews;
  const reportId = z.uuid().safeParse(id);
  if (!reportId.success) notFound();
  const { supabase, timeZone } = await requireAdmin();
  const { data: report, error } = await supabase
    .from("reports")
    .select(
      "id, target_id, reporter_id, reason, body, status, resolved_at, resolution_note, created_at, reporter:profiles!reports_reporter_id_fkey(first_name, last_name, username)",
    )
    .eq("id", reportId.data)
    .eq("target_type", "review")
    // An appeal of a dispute is decided in /admin/reports, by another admin.
    .is("appeal_of", null)
    .maybeSingle();
  if (error) throw new Error(`loading a review dispute failed: ${error.code}`);
  if (!report) notFound();

  const [{ data: review, error: reviewError }, { data: revisions, error: revisionsError }] = await Promise.all([
    supabase
      .from("reviews")
      .select("id, client_id, trainer_id, rating, body, status, hidden_reason, trainer_reply, trainer_replied_at, deleted_at, created_at")
      .eq("id", report.target_id)
      .maybeSingle(),
    supabase.from("review_revisions").select("id, rating, body, created_at").eq("review_id", report.target_id).order("created_at", { ascending: false }),
  ]);
  if (reviewError) throw new Error(`loading a review failed: ${reviewError.code}`);
  if (revisionsError) throw new Error(`loading review revisions failed: ${revisionsError.code}`);
  const { data: people, error: peopleError } = review
    ? await supabase.from("profiles").select("id, first_name, last_name, username").in("id", [review.client_id, review.trainer_id])
    : { data: [], error: null };
  if (peopleError) throw new Error(`loading review people failed: ${peopleError.code}`);
  const person = (userId: string | undefined): PersonName | undefined => people.find((row) => row.id === userId);

  const date = new Intl.DateTimeFormat(INTL_LOCALE[locale], { dateStyle: "medium", timeStyle: "short", timeZone });
  const ratingLabel = (n: number) => interpolate(t.reviews.ratingLabel, { n });
  const reason = isDisputeReason(report.reason) ? t.reviews.trainer.reasons[report.reason] : report.reason;

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="dispute-review" className="flex flex-col gap-2">
        <h2 id="dispute-review" className="px-4 text-footnote text-ink-2">
          {copy.review}
        </h2>
        {review ? (
          <div className="flex flex-col items-start gap-2 rounded-lg bg-surface-1 p-4">
            <Stars rating={review.rating} label={ratingLabel(review.rating)} />
            {review.body ? (
              <p className="text-body break-words whitespace-pre-wrap">{review.body}</p>
            ) : (
              <p className="text-callout text-ink-2">{copy.noText}</p>
            )}
            {review.trainer_reply ? (
              <div className="flex w-full flex-col gap-1 border-l-2 border-line-strong pl-3">
                <span className="text-footnote text-ink-2">{t.reviews.reply}</span>
                <p className="text-subhead break-words whitespace-pre-wrap">{review.trainer_reply}</p>
              </div>
            ) : null}
            {review.deleted_at ? <p className="text-footnote text-ink-2">{copy.deletedByAuthor}</p> : null}
          </div>
        ) : (
          <p className="px-4 text-callout text-ink-2">{copy.reviewGone}</p>
        )}
      </section>

      <ListGroup header={copy.dispute}>
        <ListRow title={copy.reason} value={reason} />
        <ListRow
          title={copy.trainer}
          value={report.reporter ? personName(report.reporter, copy.noName) : copy.deleted}
          href={report.reporter_id ? `/admin/users/${report.reporter_id}` : undefined}
        />
        <ListRow title={copy.sent} value={date.format(new Date(report.created_at))} />
        <ListRow title={copy.status} trailing={<Badge tone={DISPUTE_TONE[report.status]}>{copy.statuses[report.status]}</Badge>} />
      </ListGroup>
      {report.body ? (
        <section aria-labelledby="dispute-details" className="flex flex-col gap-2">
          <h2 id="dispute-details" className="px-4 text-footnote text-ink-2">
            {copy.details}
          </h2>
          <p className="rounded-lg bg-surface-1 p-4 text-body break-words whitespace-pre-wrap">{report.body}</p>
        </section>
      ) : null}

      {review ? (
        <ListGroup header={copy.about}>
          <ListRow
            title={copy.author}
            value={personName(person(review.client_id), copy.noName)}
            href={`/admin/users/${review.client_id}`}
          />
          <ListRow
            title={copy.trainer}
            value={personName(person(review.trainer_id), copy.noName)}
            href={`/admin/users/${review.trainer_id}`}
          />
          <ListRow title={copy.written} value={date.format(new Date(review.created_at))} />
        </ListGroup>
      ) : null}

      {revisions.length ? (
        <ListGroup header={interpolate(copy.revisions, { n: revisions.length })}>
          {revisions.map((revision) => (
            <ListRow
              key={revision.id}
              leading={<Stars rating={revision.rating} label={ratingLabel(revision.rating)} />}
              title={<span className="break-words whitespace-pre-wrap">{revision.body || copy.noText}</span>}
              subtitle={date.format(new Date(revision.created_at))}
            />
          ))}
        </ListGroup>
      ) : null}

      <section aria-labelledby="dispute-decision" className="flex flex-col gap-2">
        <h2 id="dispute-decision" className="px-4 text-footnote text-ink-2">
          {copy.decision}
        </h2>
        {report.status === "open" ? (
          <>
            <p className="px-4 text-callout text-ink-2">{copy.decisionText}</p>
            <ReviewDecision reportId={report.id} />
          </>
        ) : (
          <div className="flex flex-col gap-1 rounded-lg bg-surface-1 p-4">
            <p className="text-body">{copy.decided[report.status]}</p>
            {report.resolution_note ? (
              <p className="text-subhead break-words whitespace-pre-wrap">{interpolate(copy.hiddenReason, { reason: report.resolution_note })}</p>
            ) : null}
            {report.resolved_at ? <span className="text-footnote text-ink-2">{date.format(new Date(report.resolved_at))}</span> : null}
          </div>
        )}
      </section>
    </div>
  );
}

/** One dispute about a review (wave-2 §11 rule 7): the review with its history, the trainer's reason, the decision. */
export default async function AdminReviewDisputePage({ params }: PageProps<"/[lang]/admin/reviews/[id]">) {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.adminReviews.detailTitle} back={{ fallbackHref: "/admin/reviews" }} />}>
      <Suspense fallback={<SkeletonRows rows={5} label={t.common.loading} />}>
        <Dispute params={params} />
      </Suspense>
    </Screen>
  );
}
