"use client";

import { Check, EyeOff } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/sonner";
import { TextArea } from "@/components/ui/text-area";
import { useI18n } from "@/i18n/client";
import { decideReviewDispute, type ReviewDecisionResult } from "@/lib/admin/review-actions";
import { REVIEW_TEXT_MAX } from "@/lib/reviews/reviews";

/** "Оставить" or "Скрыть" for a disputed review (wave-2 §11 rule 7); hiding asks for the reason the author sees. */
export function ReviewDecision({ reportId }: { reportId: string }) {
  const { t } = useI18n();
  const copy = t.adminReviews;
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [keeping, startKeep] = useTransition();
  const [hiding, startHide] = useTransition();

  function report({ status }: ReviewDecisionResult, done: string): boolean {
    if (status === "done") toast.success(done);
    else toast.error(status === "closed" ? copy.alreadyDecided : copy.decideFailed);
    return status === "done" || status === "closed";
  }

  function hide(formData: FormData) {
    const reason = String(formData.get("reason") ?? "").trim();
    const problem = !reason ? copy.errors.reason : reason.length > REVIEW_TEXT_MAX ? copy.errors.long : undefined;
    setError(problem);
    if (problem) return;
    startHide(async () => {
      if (report(await decideReviewDispute({ reportId, hide: true, reason }), copy.hidden)) setOpen(false);
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        icon={Check}
        loading={keeping}
        disabled={hiding}
        onClick={() => startKeep(async () => void report(await decideReviewDispute({ reportId, hide: false }), copy.kept))}
      >
        {copy.keep}
      </Button>
      <Button
        icon={EyeOff}
        variant="secondary"
        disabled={keeping}
        onClick={() => {
          setError(undefined);
          setOpen(true);
        }}
      >
        {copy.hide}
      </Button>
      <Sheet open={open} onOpenChange={(next) => !hiding && setOpen(next)} title={copy.hideTitle} description={copy.hideText}>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            hide(new FormData(event.currentTarget));
          }}
        >
          <TextArea name="reason" label={copy.reasonLabel} hint={copy.reasonHint} error={error} maxLength={REVIEW_TEXT_MAX + 100} />
          <Button type="submit" size="lg" block loading={hiding}>
            {copy.hideConfirm}
          </Button>
        </form>
      </Sheet>
    </div>
  );
}
