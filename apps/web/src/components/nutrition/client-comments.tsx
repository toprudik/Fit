"use client";

import { Eye, EyeOff, MessageSquare } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { useI18n } from "@/i18n/client";
import { interpolate } from "@/i18n/format";
import type { DayComment } from "@/lib/nutrition/diary-load";
import { hideComment } from "@/lib/nutrition/diary-actions";

/** The trainer's comments on the day (§3.12, §3.14): the client may hide one on their side and show it again. */
export function ClientComments({ comments }: { comments: DayComment[] }) {
  const { t } = useI18n();
  const copy = t.foodDiary.comments;
  const [showHidden, setShowHidden] = useState(false);
  const [pending, startTransition] = useTransition();
  if (!comments.length) return null;
  const hiddenCount = comments.filter((comment) => comment.hidden).length;
  const shown = comments.filter((comment) => showHidden || !comment.hidden);

  function toggle(comment: DayComment) {
    startTransition(async () => {
      const result = await hideComment(comment.id, !comment.hidden);
      if (!result.ok) toast.error(t.foodDiary.failed);
      else toast.success(comment.hidden ? copy.shown : copy.hidden);
    });
  }

  return (
    <section aria-labelledby="food-comments" className="flex flex-col gap-3">
      <h2 id="food-comments" className="px-1 text-headline">
        {copy.title}
      </h2>
      {shown.map((comment) => (
        <article key={comment.id} className="flex flex-col gap-2 rounded-lg bg-surface-1 p-4">
          <p className="flex items-center gap-2 text-footnote text-ink-2">
            <MessageSquare className="size-4" aria-hidden />
            {comment.authorName || t.nutrition.target.sources.trainerUnnamed}
          </p>
          <p className="text-body whitespace-pre-line">{comment.body}</p>
          <div>
            <Button size="sm" variant="ghost" icon={comment.hidden ? Eye : EyeOff} disabled={pending} onClick={() => toggle(comment)}>
              {comment.hidden ? copy.show : copy.hide}
            </Button>
          </div>
        </article>
      ))}
      {hiddenCount > 0 && !showHidden ? (
        <Button size="sm" variant="ghost" onClick={() => setShowHidden(true)} className="self-start">
          {interpolate(copy.hiddenCount, { count: hiddenCount })}
        </Button>
      ) : null}
    </section>
  );
}
