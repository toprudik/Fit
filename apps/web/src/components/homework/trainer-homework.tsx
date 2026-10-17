import { ClipboardCheck, Plus } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ListGroup, ListRow } from "@/components/ui/list";
import { interpolate } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import { homeworkSchedule } from "@/lib/homework/format";
import { completionRate, currentOccurrence, occurrenceState, type OccurrenceState } from "@/lib/homework/homework";
import { loadHomeworkPair, loadPairHomework } from "@/lib/homework/load";

export const STATE_TONE: Record<OccurrenceState, "success" | "danger" | "neutral"> = {
  done: "success",
  overdue: "danger",
  open: "neutral",
};

/**
 * "Домашние задания" above the logs in the pair's "Тренировки" tab (screens.md, PRD wave-2 §10): the homework
 * that is not archived, the state of each one's current deadline and the share done over 30 days (10-6).
 */
export async function TrainerHomework({ coachingId }: { coachingId: string }) {
  const [t, locale] = await Promise.all([getDictionary(), getLocale()]);
  const [pair, loaded] = await Promise.all([loadHomeworkPair(coachingId), loadPairHomework(coachingId, locale)]);
  if (!pair?.viewerIsTrainer || !loaded) return null;
  const copy = t.homework;
  const active = loaded.homework.filter((h) => !h.archived);
  if (!active.length && !pair.canGive) return null;
  const rate = completionRate(loaded.homework, loaded.today);
  const base = `/trainer/clients/${coachingId}/workouts/homework`;
  const give = pair.canGive ? (
    <Link href={`${base}/new`} className={buttonVariants({ variant: "secondary", block: true })}>
      <Plus aria-hidden size={20} />
      {copy.new}
    </Link>
  ) : null;

  if (!active.length) {
    return <EmptyState icon={ClipboardCheck} title={copy.emptyTitle} description={copy.emptyText} action={give} />;
  }
  return (
    <div className="flex flex-col gap-3">
      <ListGroup header={copy.title} footer={rate ? interpolate(copy.completion, { done: rate.done, total: rate.total }) : undefined}>
        {active.map((homework) => {
          const current = currentOccurrence(homework);
          const state = current ? occurrenceState(current, loaded.today) : null;
          return (
            <ListRow
              key={homework.id}
              icon={ClipboardCheck}
              title={homework.title}
              subtitle={homeworkSchedule(t, locale, homework)}
              trailing={state ? <Badge tone={STATE_TONE[state]}>{copy.state[state]}</Badge> : undefined}
              href={`${base}/${homework.id}`}
            />
          );
        })}
      </ListGroup>
      {give}
    </div>
  );
}
