import { getDictionary } from "@/i18n/server";
import { interpolate } from "@/i18n/format";
import { loadMyReview } from "@/lib/reviews/load";
import { ReportButton } from "@/components/reports/report-button";
import { DeleteReviewButton, ReviewButton } from "./review-form";
import { Stars } from "./stars";

/**
 * "Отзыв о тренере" on the client's card of a trainer (wave-2 §11): nothing before the third attended session,
 * then "Оставить отзыв", or the review with the trainer's reply, its state and "Изменить" / "Удалить".
 */
export async function ClientReview({ coachingId }: { coachingId: string }) {
  const [t, state] = await Promise.all([getDictionary(), loadMyReview(coachingId)]);
  if (!state || (!state.eligible && !state.review)) return null;
  const copy = t.reviews;
  const { review } = state;
  return (
    <section aria-labelledby="pair-review" className="flex flex-col gap-1.5">
      <h2 id="pair-review" className="px-4 text-footnote text-ink-2">
        {copy.title}
      </h2>
      <div className="flex flex-col items-start gap-3 rounded-lg bg-surface-1 p-4">
        {review ? (
          <>
            <Stars rating={review.rating} label={interpolate(copy.ratingLabel, { n: review.rating })} />
            {review.body ? <p className="text-body break-words whitespace-pre-wrap">{review.body}</p> : null}
            {review.status === "hidden" && review.hiddenReason ? (
              <p className="text-footnote text-danger">{interpolate(copy.hidden, { reason: review.hiddenReason })}</p>
            ) : review.status === "disputed" ? (
              <p className="text-footnote text-ink-2">{copy.disputed}</p>
            ) : null}
            {review.reply ? (
              <div className="flex w-full flex-col gap-1 border-l-2 border-line-strong pl-3">
                <span className="text-footnote text-ink-2">{copy.reply}</span>
                <p className="text-subhead break-words whitespace-pre-wrap">{review.reply}</p>
                <div className="-ml-3">
                  <ReportButton target={{ kind: "content", targetType: "review_reply", targetId: review.id }} />
                </div>
              </div>
            ) : null}
            <p className="text-footnote text-ink-2">{copy.visibility}</p>
            <div className="flex flex-wrap gap-2">
              {state.eligible ? <ReviewButton coachingId={coachingId} current={review} /> : null}
              <DeleteReviewButton coachingId={coachingId} />
            </div>
          </>
        ) : (
          <>
            <p className="text-subhead text-ink-2">{copy.leaveText}</p>
            <ReviewButton coachingId={coachingId} current={null} />
          </>
        )}
      </div>
    </section>
  );
}
