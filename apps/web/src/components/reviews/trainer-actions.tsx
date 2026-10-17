"use client";

import { Flag, MessageSquareReply, Pencil } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ChipRadio } from "@/components/ui/chip";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/sonner";
import { TextArea } from "@/components/ui/text-area";
import { useI18n } from "@/i18n/client";
import { disputeReview, replyToReview } from "@/lib/reviews/actions";
import { DISPUTE_REASONS, REVIEW_TEXT_MAX, reviewText, type DisputeReason } from "@/lib/reviews/reviews";

/** "Ответить" / "Изменить ответ": the trainer's one public answer (wave-2 §11 rule 5). */
export function ReplyButton({ reviewId, reply }: { reviewId: string; reply: string | null }) {
  const { t } = useI18n();
  const copy = t.reviews.trainer;
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    const body = reviewText(String(formData.get("reply") ?? ""));
    setError(body === "long" ? t.reviews.errors.long : undefined);
    if (body === "long") return;
    startTransition(async () => {
      const result = await replyToReview({ reviewId, body });
      if (!result.ok) {
        toast.error(t.reviews.failed);
        return;
      }
      setOpen(false);
      toast.success(copy.replySaved);
    });
  }

  return (
    <>
      <Button
        icon={reply ? Pencil : MessageSquareReply}
        variant="secondary"
        onClick={() => {
          setError(undefined);
          setOpen(true);
        }}
      >
        {reply ? copy.editReply : copy.reply}
      </Button>
      <Sheet open={open} onOpenChange={(next) => !pending && setOpen(next)} title={copy.replyTitle} description={copy.replyText}>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit(new FormData(event.currentTarget));
          }}
        >
          <TextArea
            name="reply"
            label={copy.replyLabel}
            hint={reply ? copy.replyHint : undefined}
            error={error}
            maxLength={REVIEW_TEXT_MAX + 100}
            defaultValue={reply ?? undefined}
          />
          <Button type="submit" size="lg" block loading={pending}>
            {copy.replySave}
          </Button>
        </form>
      </Sheet>
    </>
  );
}

/** "Оспорить" with a reason: the review goes to the DaFit team (wave-2 §11 rule 7). */
export function DisputeButton({ reviewId }: { reviewId: string }) {
  const { t } = useI18n();
  const copy = t.reviews.trainer;
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<DisputeReason | null>(null);
  const [errors, setErrors] = useState<{ reason?: string; body?: string }>({});
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    const body = reviewText(String(formData.get("details") ?? ""));
    setErrors({ reason: reason ? undefined : copy.errors.reason, body: body === "long" ? t.reviews.errors.long : undefined });
    if (!reason || body === "long") return;
    startTransition(async () => {
      const result = await disputeReview({ reviewId, reason, body });
      if (!result.ok) {
        toast.error(t.reviews.failed);
        return;
      }
      setOpen(false);
      toast.success(copy.disputeSent);
    });
  }

  return (
    <>
      <Button
        icon={Flag}
        variant="ghost"
        onClick={() => {
          setReason(null);
          setErrors({});
          setOpen(true);
        }}
      >
        {copy.dispute}
      </Button>
      <Sheet open={open} onOpenChange={(next) => !pending && setOpen(next)} title={copy.disputeTitle} description={copy.disputeText}>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit(new FormData(event.currentTarget));
          }}
        >
          <fieldset aria-describedby={errors.reason ? `dispute-reason-error-${reviewId}` : undefined}>
            <legend className="mb-2 px-1 text-footnote text-ink-2">{copy.reason}</legend>
            <div className="flex flex-wrap gap-2">
              {DISPUTE_REASONS.map((value) => (
                <ChipRadio key={value} name="reason" value={value} checked={reason === value} onChange={() => setReason(value)}>
                  {copy.reasons[value]}
                </ChipRadio>
              ))}
            </div>
            {errors.reason ? (
              <p id={`dispute-reason-error-${reviewId}`} className="mt-2 px-1 text-footnote text-danger">
                {errors.reason}
              </p>
            ) : null}
          </fieldset>
          <TextArea name="details" label={copy.details} hint={copy.detailsHint} error={errors.body} maxLength={REVIEW_TEXT_MAX + 100} />
          <Button type="submit" size="lg" block loading={pending}>
            {copy.disputeSend}
          </Button>
        </form>
      </Sheet>
    </>
  );
}
