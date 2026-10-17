import { ClipboardCheck, Dumbbell, PlayCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ListGroup, ListRow } from "@/components/ui/list";
import { interpolate } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import { formatHomeworkDay, homeworkSchedule } from "@/lib/homework/format";
import { canMark, canUnmark, currentOccurrence, occurrenceState } from "@/lib/homework/homework";
import { loadClientHomework } from "@/lib/homework/load";
import { HomeworkMark } from "./homework-mark";
import { STATE_TONE } from "./trainer-homework";

/** Request time, outside the component so rendering stays pure. */
function now(): Date {
  return new Date();
}

/** The client's homework from every trainer, each with its current deadline and "Выполнено" (PRD wave-2 §10). */
export async function ClientHomework() {
  const [t, locale] = await Promise.all([getDictionary(), getLocale()]);
  const loaded = await loadClientHomework(locale);
  const copy = t.homework;
  if (!loaded?.homework.length) {
    return <EmptyState icon={ClipboardCheck} title={copy.clientEmptyTitle} description={copy.clientEmptyText} />;
  }
  const at = now();
  return (
    <div className="flex w-full max-w-2xl flex-col gap-4">
      {loaded.homework.map((homework) => {
        // A mark that can still be taken back stays in view, with the next deadline under it.
        const current = homework.occurrences.filter((o) => canUnmark(o, at)).at(-1) ?? currentOccurrence(homework);
        const state = current ? occurrenceState(current, loaded.today) : null;
        const next = current ? homework.occurrences.find((o) => !o.doneAt && o.dueOn > current.dueOn) : undefined;
        const headingId = `homework-${homework.id}`;
        return (
          <section key={homework.id} aria-labelledby={headingId} className="flex flex-col gap-3 rounded-lg bg-surface-1 p-4">
            <div className="flex items-start gap-2">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <h2 id={headingId} className="text-headline">
                  {homework.title}
                </h2>
                <p className="text-footnote text-ink-2">
                  {interpolate(copy.fromTrainer, { name: homework.trainer })} · {homeworkSchedule(t, locale, homework)}
                </p>
              </div>
              {state ? <Badge tone={STATE_TONE[state]}>{copy.state[state]}</Badge> : null}
            </div>
            {homework.description ? <p className="whitespace-pre-line text-body">{homework.description}</p> : null}
            {homework.exercises.length ? (
              <ListGroup surface="raised" header={copy.exercises} headingLevel={3}>
                {homework.exercises.map((exercise, index) => (
                  <ListRow key={index} title={exercise.name} subtitle={exercise.prescription ?? undefined} />
                ))}
              </ListGroup>
            ) : null}
            {homework.videoUrl ? (
              <ListGroup surface="raised">
                <ListRow icon={PlayCircle} title={copy.video} href={homework.videoUrl} />
              </ListGroup>
            ) : null}
            {current ? (
              <>
                {homework.repeatWeekdays ? (
                  <p className="text-subhead">{interpolate(copy.due, { date: formatHomeworkDay(locale, current.dueOn) })}</p>
                ) : null}
                <HomeworkMark
                  occurrenceId={current.id}
                  canMark={canMark(homework, current, loaded.today)}
                  canUnmark={canUnmark(current, at)}
                  logHref={homework.exercises.length ? `/client/diary/workouts/new?homework=${current.id}` : undefined}
                />
                {current.workoutLogId ? (
                  <ListGroup surface="raised">
                    <ListRow icon={Dumbbell} title={copy.loggedWorkout} href={`/client/diary/workouts/${current.workoutLogId}`} />
                  </ListGroup>
                ) : null}
                {next && current.doneAt ? (
                  <p className="text-footnote text-ink-2">{interpolate(copy.next, { date: formatHomeworkDay(locale, next.dueOn) })}</p>
                ) : null}
              </>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

/** The row on "Занятия" that opens the homework, with how many deadlines that came are not done. */
export async function ClientHomeworkRow() {
  const [t, locale] = await Promise.all([getDictionary(), getLocale()]);
  const loaded = await loadClientHomework(locale);
  if (!loaded?.homework.length) return null;
  const open = loaded.homework.flatMap((h) => h.occurrences).filter((o) => !o.doneAt && o.dueOn <= loaded.today).length;
  return (
    <ListGroup>
      <ListRow
        icon={ClipboardCheck}
        title={t.homework.open}
        subtitle={open ? interpolate(t.homework.openCount, { count: open }) : undefined}
        href="/client/sessions/homework"
      />
    </ListGroup>
  );
}
