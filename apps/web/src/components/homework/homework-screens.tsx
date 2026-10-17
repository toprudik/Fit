import { ClipboardCheck, PlayCircle } from "lucide-react";
import { Suspense } from "react";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ListGroup, ListRow } from "@/components/ui/list";
import { SkeletonRows } from "@/components/ui/skeleton";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { getDictionary, getLocale } from "@/i18n/server";
import { formatHomeworkDay, homeworkSchedule } from "@/lib/homework/format";
import { draftFromHomework, occurrenceState, type HomeworkDraft } from "@/lib/homework/homework";
import { loadHomework, loadHomeworkPair, loadPairHomework, visibleLogIds } from "@/lib/homework/load";
import { ArchiveHomework, HomeworkForm } from "./homework-form";
import { STATE_TONE } from "./trainer-homework";

const workoutsHref = (coachingId: string) => `/trainer/clients/${coachingId}/workouts`;

function NotFound({ t }: { t: Dictionary }) {
  return <EmptyState icon={ClipboardCheck} title={t.workouts.logs.notFoundTitle} description={t.workouts.logs.notFoundText} />;
}

async function NewForm({ t, locale, coachingId }: { t: Dictionary; locale: Locale; coachingId: Promise<string> }) {
  const id = await coachingId;
  const pair = await loadHomeworkPair(id);
  const today = pair?.canGive ? (await loadPairHomework(id, locale))?.today : null;
  if (!pair?.canGive || !today) return <NotFound t={t} />;
  const initial: HomeworkDraft = { title: "", description: "", videoUrl: "", dueDate: today, repeat: false, weekdays: [], repeatUntil: "", exercises: [] };
  return <HomeworkForm target={{ coachingId: id }} initial={initial} today={today} />;
}

/** "Новое задание" in the pair's "Тренировки" tab (PRD wave-2 §10-1). */
export async function NewHomeworkPage({ coachingId }: { coachingId: Promise<string> }) {
  const [t, locale] = await Promise.all([getDictionary(), getLocale()]);
  return (
    <Screen header={<ScreenHeader title={t.homework.newTitle} back={{ fallbackHref: "/trainer/clients" }} />}>
      <Suspense fallback={<SkeletonRows rows={4} label={t.common.loading} />}>
        <NewForm t={t} locale={locale} coachingId={coachingId} />
      </Suspense>
    </Screen>
  );
}

async function Detail({
  t,
  locale,
  coachingId,
  homeworkId,
}: {
  t: Dictionary;
  locale: Locale;
  coachingId: Promise<string>;
  homeworkId: Promise<string>;
}) {
  const [pairId, id] = await Promise.all([coachingId, homeworkId]);
  const [pair, loaded] = await Promise.all([loadHomeworkPair(pairId), loadHomework(id, locale)]);
  if (!pair?.viewerIsTrainer || !loaded || loaded.homework.coachingId !== pairId) {
    return (
      <Screen header={<ScreenHeader title={t.homework.editTitle} back={{ fallbackHref: workoutsHref(pairId) }} />}>
        <NotFound t={t} />
      </Screen>
    );
  }
  const { homework, today } = loaded;
  const copy = t.homework;
  const logs = await visibleLogIds(homework.occurrences.map((o) => o.workoutLogId));
  const editable = pair.canGive && !homework.archived;
  return (
    <Screen
      header={
        <ScreenHeader
          title={homework.title}
          subtitle={homework.archived ? copy.archived : homeworkSchedule(t, locale, homework)}
          back={{ fallbackHref: workoutsHref(pairId) }}
        />
      }
    >
      <div className="flex flex-col gap-6">
        <ListGroup header={copy.deadlines} className="w-full max-w-2xl">
          {homework.occurrences.map((occurrence) => {
            const state = occurrenceState(occurrence, today);
            return (
              <ListRow
                key={occurrence.id}
                title={formatHomeworkDay(locale, occurrence.dueOn)}
                subtitle={occurrence.comment ?? undefined}
                href={
                  occurrence.workoutLogId && logs.has(occurrence.workoutLogId)
                    ? `${workoutsHref(pairId)}/${occurrence.workoutLogId}`
                    : undefined
                }
                trailing={<Badge tone={STATE_TONE[state]}>{copy.state[state]}</Badge>}
              />
            );
          })}
        </ListGroup>
        {homework.videoUrl && !editable ? (
          <ListGroup className="w-full max-w-2xl">
            <ListRow icon={PlayCircle} title={copy.video} href={homework.videoUrl} />
          </ListGroup>
        ) : null}
        {editable ? (
          <>
            <HomeworkForm
              target={{ coachingId: pairId, id: homework.id, dueDate: homework.dueDate }}
              initial={draftFromHomework(homework)}
              today={today}
            />
            <ArchiveHomework id={homework.id} coachingId={pairId} />
          </>
        ) : null}
      </div>
    </Screen>
  );
}

/** One homework: its deadlines with the client's marks and comments, the form to change it and "В архив". */
export async function HomeworkDetailPage({ coachingId, homeworkId }: { coachingId: Promise<string>; homeworkId: Promise<string> }) {
  const [t, locale] = await Promise.all([getDictionary(), getLocale()]);
  return (
    <Suspense
      fallback={
        <Screen header={<ScreenHeader title={t.homework.editTitle} back={{ fallbackHref: "/trainer/clients" }} />}>
          <SkeletonRows rows={4} label={t.common.loading} />
        </Screen>
      }
    >
      <Detail t={t} locale={locale} coachingId={coachingId} homeworkId={homeworkId} />
    </Suspense>
  );
}
