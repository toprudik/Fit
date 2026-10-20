"use client";

import { Eye, EyeOff, MessageCircle, MessageSquare } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { useI18n } from "@/i18n/client";
import { interpolate } from "@/i18n/format";
import type { DayComment } from "@/lib/nutrition/diary-load";
import { hideComment } from "@/lib/nutrition/diary-actions";
import { ReportButton } from "@/components/reports/report-button";

/** A Telegram username as Telegram allows it, so a stored value never builds an odd link. */
const TELEGRAM_USERNAME = /^[A-Za-z0-9_]{5,32}$/;

/**
 * "Ответить" (§3.13, Q39): replies happen in Telegram, so it opens the chat with the comment's author. Without
 * a username it opens the pair, where "Попросить связаться" asks the trainer to write first.
 */
function ReplyButton({ comment, label }: { comment: DayComment; label: string }) {
  const username = comment.authorUsername && TELEGRAM_USERNAME.test(comment.authorUsername) ? comment.authorUsername : null;
  return (
    <Button asChild size="sm" variant="ghost" icon={MessageCircle}>
      {username ? (
        <a href={`https://t.me/${username}`} target="_blank" rel="noopener noreferrer">
          {label}
        </a>
      ) : (
        <Link href={`/client/trainers/${comment.coachingId}`}>{label}</Link>
      )}
    </Button>
  );
}

/**
 * The trainer's comments on the day (§3.12 to §3.14): "Ответить" opens the chat with the trainer, and the
 * client may hide a comment on their side and show it again.
 */
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
          <div className="flex flex-wrap gap-2">
            <ReplyButton comment={comment} label={copy.reply} />
            <Button size="sm" variant="ghost" icon={comment.hidden ? Eye : EyeOff} disabled={pending} onClick={() => toggle(comment)}>
              {comment.hidden ? copy.show : copy.hide}
            </Button>
            <ReportButton target={{ kind: "content", targetType: "food_comment", targetId: comment.id }} />
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
