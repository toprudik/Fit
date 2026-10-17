"use client";

import { Check, Dumbbell, Undo2 } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { TextArea } from "@/components/ui/text-area";
import { useI18n } from "@/i18n/client";
import { markHomeworkDone, unmarkHomeworkDone } from "@/lib/homework/actions";
import { HOMEWORK_COMMENT_MAX_LENGTH } from "@/lib/homework/homework";

/**
 * The client's "Выполнено" on a deadline, with an optional comment for the trainer, and "Снять отметку"
 * within 24 hours (PRD wave-2 §10-3, 10-4). With `logHref`, "Записать подходы" opens a log of the homework's
 * exercises that marks the deadline when saved (10.2).
 */
export function HomeworkMark({
  occurrenceId,
  canMark,
  canUnmark,
  logHref,
}: {
  occurrenceId: string;
  canMark: boolean;
  canUnmark: boolean;
  logHref?: string;
}) {
  const { t } = useI18n();
  const copy = t.homework;
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [pending, startTransition] = useTransition();

  function mark(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await markHomeworkDone({ occurrenceId, comment });
      if (result.ok) {
        toast.success(copy.marked);
        setOpen(false);
        setComment("");
      } else {
        toast.error(result.reason === "not_yet" ? copy.notYet : copy.failed);
      }
    });
  }

  function unmark() {
    startTransition(async () => {
      const result = await unmarkHomeworkDone(occurrenceId);
      if (result.ok) toast.success(copy.unmarked);
      else toast.error(result.reason === "too_late" ? copy.tooLate : copy.failed);
    });
  }

  if (canUnmark) {
    return (
      <Button variant="secondary" icon={Undo2} loading={pending} onClick={unmark} className="self-start">
        {copy.unmark}
      </Button>
    );
  }
  if (!canMark) return null;
  if (!open) {
    return (
      <div className="flex flex-wrap gap-2">
        <Button icon={Check} onClick={() => setOpen(true)}>
          {copy.mark}
        </Button>
        {logHref ? (
          <Link href={logHref} className={buttonVariants({ variant: "secondary" })}>
            <Dumbbell aria-hidden size={20} />
            {copy.logSets}
          </Link>
        ) : null}
      </div>
    );
  }
  return (
    <form onSubmit={mark} className="flex flex-col gap-3">
      <TextArea
        label={copy.comment}
        hint={copy.commentHint}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        maxLength={HOMEWORK_COMMENT_MAX_LENGTH}
        rows={2}
        autoFocus
      />
      <div className="flex gap-2">
        <Button type="submit" icon={Check} loading={pending}>
          {copy.markSubmit}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
          {copy.cancel}
        </Button>
      </div>
    </form>
  );
}
