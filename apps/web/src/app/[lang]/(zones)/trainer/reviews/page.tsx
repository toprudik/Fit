import type { Metadata } from "next";
import { Star } from "lucide-react";
import { Suspense } from "react";
import { Stars } from "@/components/reviews/stars";
import { DisputeButton, ReplyButton } from "@/components/reviews/trainer-actions";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonRows } from "@/components/ui/skeleton";
import { interpolate } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import { formatDay } from "@/lib/pairs/format";
import { loadTrainerReviews } from "@/lib/reviews/load";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.reviews.trainer.title };
}

async function Reviews() {
  const [t, locale, data] = await Promise.all([getDictionary(), getLocale(), loadTrainerReviews()]);
  const copy = t.reviews.trainer;
  if (!data || data.reviews.length === 0) return <EmptyState icon={Star} title={copy.empty} description={copy.emptyText} />;
  return (
    <ul className="flex flex-col gap-3">
      {data.reviews.map((review) => (
        <li key={review.id}>
          <article aria-label={review.clientName || copy.unnamed} className="flex flex-col items-start gap-2 rounded-lg bg-surface-1 p-4">
            <div className="flex w-full flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h2 className="text-headline">{review.clientName || copy.unnamed}</h2>
              <span className="text-footnote text-ink-2 tabular-nums">{formatDay(locale, review.updatedAt, data.timeZone)}</span>
            </div>
            <Stars rating={review.rating} label={interpolate(t.reviews.ratingLabel, { n: review.rating })} />
            {review.body ? <p className="text-body break-words whitespace-pre-wrap">{review.body}</p> : null}
            {review.reply ? (
              <div className="flex w-full flex-col gap-1 border-l-2 border-line-strong pl-3">
                <span className="text-footnote text-ink-2">{copy.yourReply}</span>
                <p className="text-subhead break-words whitespace-pre-wrap">{review.reply}</p>
              </div>
            ) : null}
            {review.status === "disputed" ? <p className="text-footnote text-ink-2">{copy.disputed}</p> : null}
            <div className="mt-1 flex flex-wrap gap-2">
              <ReplyButton reviewId={review.id} reply={review.reply} />
              {review.status === "published" ? <DisputeButton reviewId={review.id} /> : null}
            </div>
          </article>
        </li>
      ))}
    </ul>
  );
}

/** "Отзывы" in the trainer zone (wave-2 §11): the clients' reviews with the trainer's replies and "Оспорить". */
export default async function TrainerReviewsPage() {
  const t = await getDictionary();
  const copy = t.reviews.trainer;
  return (
    <Screen header={<ScreenHeader title={copy.title} back={{ fallbackHref: "/trainer/more" }} />}>
      <div className="flex w-full max-w-2xl flex-col gap-4 pt-4 md:pt-0">
        <p className="text-callout text-ink-2">{copy.visibility}</p>
        <Suspense fallback={<SkeletonRows rows={3} label={t.common.loading} />}>
          <Reviews />
        </Suspense>
      </div>
    </Screen>
  );
}
