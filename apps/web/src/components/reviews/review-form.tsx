"use client";

import { Pencil, Star, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ChipRadio } from "@/components/ui/chip";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/sonner";
import { TextArea } from "@/components/ui/text-area";
import { useI18n } from "@/i18n/client";
import { interpolate } from "@/i18n/format";
import { deleteReview, saveReview } from "@/lib/reviews/actions";
import { RATINGS, REVIEW_TEXT_MAX, reviewText } from "@/lib/reviews/reviews";

/**
 * "Оставить отзыв" / "Изменить" on the client's card of a trainer (wave-2 §11 rules 1–3): a rating from 1 to 5,
 * an optional text and who sees it.
 */
export function ReviewButton({ coachingId, current }: { coachingId: string; current: { rating: number; body: string | null } | null }) {
  const { t } = useI18n();
  const copy = t.reviews;
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState<number | null>(current?.rating ?? null);
  const [errors, setErrors] = useState<{ rating?: string; body?: string }>({});
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    const body = reviewText(String(formData.get("body") ?? ""));
    const next = { rating: rating === null ? copy.errors.rating : undefined, body: body === "long" ? copy.errors.long : undefined };
    setErrors(next);
    if (rating === null || body === "long") return;
    startTransition(async () => {
      const result = await saveReview({ coachingId, rating, body });
      if (!result.ok) {
        toast.error(result.reason === "tooFew" ? copy.tooFew : copy.failed);
        return;
      }
      setOpen(false);
      toast.success(copy.saved);
    });
  }

  return (
    <>
      <Button
        icon={current ? Pencil : Star}
        variant={current ? "secondary" : "primary"}
        onClick={() => {
          setRating(current?.rating ?? null);
          setErrors({});
          setOpen(true);
        }}
      >
        {current ? copy.edit : copy.leave}
      </Button>
      <Sheet open={open} onOpenChange={(next) => !pending && setOpen(next)} title={copy.formTitle} description={copy.visibility}>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit(new FormData(event.currentTarget));
          }}
        >
          <fieldset aria-describedby={errors.rating ? "review-rating-error" : undefined}>
            <legend className="mb-2 px-1 text-footnote text-ink-2">{copy.rating}</legend>
            <div className="flex flex-wrap gap-2">
              {RATINGS.map((n) => (
                <ChipRadio key={n} name="rating" value={n} checked={rating === n} onChange={() => setRating(n)}>
                  {interpolate(copy.ratingOption, { n })}
                </ChipRadio>
              ))}
            </div>
            {errors.rating ? (
              <p id="review-rating-error" className="mt-2 px-1 text-footnote text-danger">
                {errors.rating}
              </p>
            ) : null}
          </fieldset>
          <TextArea
            name="body"
            label={copy.body}
            hint={copy.bodyHint}
            error={errors.body}
            maxLength={REVIEW_TEXT_MAX + 100}
            defaultValue={current?.body ?? undefined}
          />
          <Button type="submit" size="lg" block loading={pending}>
            {copy.send}
          </Button>
        </form>
      </Sheet>
    </>
  );
}

/** "Удалить" with a confirmation: the trainer no longer sees the review (§11 rule 2). */
export function DeleteReviewButton({ coachingId }: { coachingId: string }) {
  const { t } = useI18n();
  const copy = t.reviews;
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <>
      <Button icon={Trash2} variant="ghost" onClick={() => setOpen(true)}>
        {copy.delete}
      </Button>
      <Sheet
        open={open}
        onOpenChange={(next) => !pending && setOpen(next)}
        title={copy.deleteTitle}
        description={copy.deleteText}
        actions={
          <Button
            variant="destructive"
            size="lg"
            block
            loading={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await deleteReview(coachingId);
                if (!result.ok) {
                  toast.error(copy.failed);
                  return;
                }
                setOpen(false);
                toast.success(copy.deleted);
              })
            }
          >
            {copy.deleteConfirm}
          </Button>
        }
      />
    </>
  );
}
