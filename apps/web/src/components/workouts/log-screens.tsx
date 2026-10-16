import { Dumbbell, Plus } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonRows } from "@/components/ui/skeleton";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { getDictionary, getLocale } from "@/i18n/server";
import { localDay, todayIn } from "@/lib/passes/present";
import { draftFromLog, type LogDraft } from "@/lib/workouts/log";
import { loadBookingStart, loadLog, loadLogs, loadWorkoutPair, viewerId, viewerTimeZone } from "@/lib/workouts/logs";
import { weightUnit } from "@/lib/workouts/units";
import { LogEditor } from "./log-editor";
import { LogList } from "./log-list";
import { LogView } from "./log-view";

/** Where the screens of one side live: the trainer's pair tab or the client's diary. */
export type LogPlace = { side: "trainer"; coachingId: string } | { side: "client" };

const listHref = (place: LogPlace) => (place.side === "trainer" ? `/trainer/clients/${place.coachingId}/workouts` : "/client/diary");
const hrefBase = (place: LogPlace) =>
  place.side === "trainer" ? `/trainer/clients/${place.coachingId}/workouts` : "/client/diary/workouts";

/** Whose logs the place shows and whether the viewer may write one there; null when it is not theirs. */
async function placeClient(place: LogPlace): Promise<{ clientId: string; canWrite: boolean } | null> {
  if (place.side === "client") {
    const me = await viewerId();
    return me ? { clientId: me, canWrite: true } : null;
  }
  const pair = await loadWorkoutPair(place.coachingId);
  if (!pair?.viewerIsTrainer) return null;
  return { clientId: pair.clientId, canWrite: pair.live };
}

function NotFound({ t }: { t: Dictionary }) {
  return <EmptyState icon={Dumbbell} title={t.workouts.logs.notFoundTitle} description={t.workouts.logs.notFoundText} />;
}

function Loading({ t }: { t: Dictionary }) {
  return <SkeletonRows rows={4} label={t.common.loading} />;
}

/** "Записать тренировку" as a button under a list or in an empty state. */
export function NewLogButton({ t, place }: { t: Dictionary; place: LogPlace }) {
  return (
    <Link href={`${hrefBase(place)}/new`} className={buttonVariants({ block: true })}>
      <Plus aria-hidden size={20} />
      {t.workouts.logs.new}
    </Link>
  );
}

/** The logs of the place's client (PRD wave-1 §2.10-4), with "Записать тренировку" where the viewer may write. */
export async function LogListSection({ place }: { place: LogPlace }) {
  const [t, locale, client] = await Promise.all([getDictionary(), getLocale(), placeClient(place)]);
  if (!client) return <NotFound t={t} />;
  const logs = await loadLogs(client.clientId, locale);
  const copy = t.workouts.logs;
  const empty =
    place.side === "client"
      ? { title: copy.clientEmptyTitle, text: copy.clientEmptyText }
      : { title: copy.emptyTitle, text: copy.emptyText };
  const action = client.canWrite ? <NewLogButton t={t} place={place} /> : undefined;
  return (
    <div className="flex flex-col gap-4">
      {logs?.length && action ? action : null}
      <LogList
        t={t}
        locale={locale}
        logs={logs}
        hrefBase={hrefBase(place)}
        side={place.side}
        empty={{ ...empty, action: logs?.length ? undefined : action }}
      />
    </div>
  );
}

async function LogDetail({ t, locale, place, logId }: { t: Dictionary; locale: Locale; place: LogPlace; logId: Promise<string> }) {
  const [id, client] = await Promise.all([logId, placeClient(place)]);
  const log = client ? await loadLog(id, locale) : null;
  if (!client || !log || log.clientId !== client.clientId) {
    return (
      <Screen header={<ScreenHeader title={t.workouts.logs.untitled} back={{ fallbackHref: listHref(place) }} />}>
        <NotFound t={t} />
      </Screen>
    );
  }
  return (
    <Screen header={<ScreenHeader title={log.title || t.workouts.logs.untitled} back={{ fallbackHref: listHref(place) }} />}>
      <LogView t={t} locale={locale} log={log} side={place.side} hrefBase={hrefBase(place)} listHref={listHref(place)} />
    </Screen>
  );
}

/** One log with its sets and records. */
export async function LogDetailPage({ place, logId }: { place: LogPlace; logId: Promise<string> }) {
  const [t, locale] = await Promise.all([getDictionary(), getLocale()]);
  return (
    <Suspense
      fallback={
        <Screen header={<ScreenHeader title={t.workouts.logs.untitled} back={{ fallbackHref: listHref(place) }} />}>
          <Loading t={t} />
        </Screen>
      }
    >
      <LogDetail t={t} locale={locale} place={place} logId={logId} />
    </Suspense>
  );
}

async function NewLogForm({ t, place, booking }: { t: Dictionary; place: LogPlace; booking: Promise<string | undefined> }) {
  const [client, timeZone, bookingId] = await Promise.all([placeClient(place), viewerTimeZone(), booking]);
  if (!client?.canWrite) return <NotFound t={t} />;
  const sessionStart = place.side === "trainer" && bookingId ? await loadBookingStart(bookingId, place.coachingId) : null;
  const initial: LogDraft = {
    title: "",
    date: sessionStart ? localDay(sessionStart, timeZone) : todayIn(timeZone),
    durationMin: "",
    notes: "",
    exercises: [],
  };
  return (
    <LogEditor
      clientId={client.clientId}
      coachingId={place.side === "trainer" ? place.coachingId : undefined}
      bookingId={sessionStart ? bookingId : undefined}
      sessionStart={sessionStart ?? undefined}
      timeZone={timeZone}
      initial={initial}
      hrefBase={hrefBase(place)}
    />
  );
}

/** "Новая тренировка"; the trainer's "?booking=" ties it to a session of the pair (PRD 2.10-4). */
export async function NewLogPage({ place, booking }: { place: LogPlace; booking: Promise<string | undefined> }) {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.workouts.editor.newTitle} back={{ fallbackHref: listHref(place) }} />}>
      <Suspense fallback={<Loading t={t} />}>
        <NewLogForm t={t} place={place} booking={booking} />
      </Suspense>
    </Screen>
  );
}

async function EditLogForm({ t, locale, place, logId }: { t: Dictionary; locale: Locale; place: LogPlace; logId: Promise<string> }) {
  const [id, client, timeZone] = await Promise.all([logId, placeClient(place), viewerTimeZone()]);
  const log = client ? await loadLog(id, locale) : null;
  if (!client || !log || log.clientId !== client.clientId || !log.editable) return <NotFound t={t} />;
  return (
    <LogEditor
      clientId={log.clientId}
      coachingId={log.coachingId ?? undefined}
      bookingId={log.bookingId ?? undefined}
      log={{ id: log.id, performedAt: log.performedAt, templateId: log.templateId ?? undefined }}
      timeZone={timeZone}
      initial={draftFromLog(log, weightUnit(locale), locale === "ru" ? "," : ".")}
      hrefBase={hrefBase(place)}
    />
  );
}

/** "Изменить тренировку": only its author (PRD 2.10-10). */
export async function EditLogPage({ place, logId }: { place: LogPlace; logId: Promise<string> }) {
  const [t, locale] = await Promise.all([getDictionary(), getLocale()]);
  return (
    <Screen header={<ScreenHeader title={t.workouts.editor.editTitle} back={{ fallbackHref: listHref(place) }} />}>
      <Suspense fallback={<Loading t={t} />}>
        <EditLogForm t={t} locale={locale} place={place} logId={logId} />
      </Suspense>
    </Screen>
  );
}
