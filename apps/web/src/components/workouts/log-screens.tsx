import { Dumbbell, EyeOff, Plus } from "lucide-react";
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
import { canMark, logDraftFromHomework } from "@/lib/homework/homework";
import { loadClientOccurrence } from "@/lib/homework/load";
import { localDay, todayIn } from "@/lib/passes/present";
import { loadTrainerShares } from "@/lib/sharing/load";
import { draftFromLog, type LogDraft } from "@/lib/workouts/log";
import { loadBookingStart, loadLog, loadLogs, loadWorkoutPair, viewerId, viewerTimeZone } from "@/lib/workouts/logs";
import { loadSubstituteParticipant, substitutePath } from "@/lib/workouts/substitute";
import { weightUnit } from "@/lib/workouts/units";
import { LogEditor } from "./log-editor";
import { LogList } from "./log-list";
import { LogView } from "./log-view";

/**
 * Where the screens of one side live: the trainer's pair tab, the client's diary, or a participant of the
 * session a substitute runs (PRD wave-3 §1 "Подмена" rule 4: the log of that session only).
 */
export type LogPlace = { side: "trainer"; coachingId: string } | { side: "client" } | { side: "substitute"; sessionId: string; bookingId: string };

function listHref(place: LogPlace): string {
  if (place.side === "trainer") return `/trainer/clients/${place.coachingId}/workouts`;
  if (place.side === "substitute") return substitutePath(place.sessionId, place.bookingId);
  return "/client/diary";
}

function hrefBase(place: LogPlace): string {
  if (place.side === "trainer") return `/trainer/clients/${place.coachingId}/workouts`;
  if (place.side === "substitute") return `${substitutePath(place.sessionId, place.bookingId)}/log`;
  return "/client/diary/workouts";
}

/** The trainer's view of a log, for the substitute too. */
const viewSide = (place: LogPlace) => (place.side === "client" ? "client" : "trainer");

type PlaceClient = {
  clientId: string;
  canWrite: boolean;
  /** A substitute's booking: the only session its logs may belong to, with the session's start. */
  booking?: { id: string; coachingId: string; startsAt: string };
};

/** Whose logs the place shows and whether the viewer may write one there; null when it is not theirs. */
async function placeClient(place: LogPlace): Promise<PlaceClient | null> {
  if (place.side === "client") {
    const me = await viewerId();
    return me ? { clientId: me, canWrite: true } : null;
  }
  if (place.side === "substitute") {
    const participant = await loadSubstituteParticipant(place.sessionId, place.bookingId);
    if (!participant) return null;
    return {
      clientId: participant.clientId,
      canWrite: participant.live,
      booking: { id: participant.bookingId, coachingId: participant.coachingId, startsAt: participant.startsAt },
    };
  }
  const pair = await loadWorkoutPair(place.coachingId);
  if (!pair?.viewerIsTrainer) return null;
  return { clientId: pair.clientId, canWrite: pair.live };
}

/** A log the place may show: the client's, and at a substitute's place only the log of its booking. */
const belongs = (client: PlaceClient, log: { clientId: string; bookingId: string | null }) =>
  log.clientId === client.clientId && (!client.booking || log.bookingId === client.booking.id);

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
  const [logs, shares] = await Promise.all([
    loadLogs(client.clientId, locale),
    place.side === "trainer" ? loadTrainerShares(place.coachingId) : null,
  ]);
  const copy = t.workouts.logs;
  const empty =
    place.side === "client"
      ? { title: copy.clientEmptyTitle, text: copy.clientEmptyText }
      : { title: copy.emptyTitle, text: copy.emptyText };
  const action = client.canWrite ? <NewLogButton t={t} place={place} /> : undefined;
  return (
    <div className="flex flex-col gap-4">
      {client.canWrite && shares && !shares.workouts ? (
        <p className="flex items-start gap-2 px-1 text-footnote text-ink-2">
          <EyeOff aria-hidden size={16} className="mt-0.5 shrink-0" />
          {copy.sharingOff}
        </p>
      ) : null}
      {logs?.length && action ? action : null}
      <LogList
        t={t}
        locale={locale}
        logs={logs}
        hrefBase={hrefBase(place)}
        side={viewSide(place)}
        empty={{ ...empty, action: logs?.length ? undefined : action }}
      />
    </div>
  );
}

async function LogDetail({ t, locale, place, logId }: { t: Dictionary; locale: Locale; place: LogPlace; logId: Promise<string> }) {
  const [id, client] = await Promise.all([logId, placeClient(place)]);
  const log = client ? await loadLog(id, locale) : null;
  if (!client || !log || !belongs(client, log)) {
    return (
      <Screen header={<ScreenHeader title={t.workouts.logs.untitled} back={{ fallbackHref: listHref(place) }} />}>
        <NotFound t={t} />
      </Screen>
    );
  }
  return (
    <Screen header={<ScreenHeader title={log.title || t.workouts.logs.untitled} back={{ fallbackHref: listHref(place) }} />}>
      <LogView t={t} locale={locale} log={log} side={viewSide(place)} hrefBase={hrefBase(place)} listHref={listHref(place)} />
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

async function NewLogForm({
  t,
  place,
  booking,
  homework,
}: {
  t: Dictionary;
  place: LogPlace;
  booking: Promise<string | undefined>;
  homework?: Promise<string | undefined>;
}) {
  const [client, timeZone, bookingId, homeworkOccurrenceId, locale] = await Promise.all([
    placeClient(place),
    viewerTimeZone(),
    booking,
    homework,
    getLocale(),
  ]);
  if (!client?.canWrite) return <NotFound t={t} />;
  // "Записать подходы" from the client's homework (PRD wave-2 §10.2): its exercises, and the mark on save.
  const fromHomework = place.side === "client" && homeworkOccurrenceId ? await loadClientOccurrence(homeworkOccurrenceId, locale) : null;
  if (fromHomework) {
    const today = todayIn(timeZone);
    return (
      <LogEditor
        clientId={client.clientId}
        timeZone={timeZone}
        initial={logDraftFromHomework(fromHomework.homework, today)}
        hrefBase={hrefBase(place)}
        homeworkOccurrenceId={canMark(fromHomework.homework, fromHomework.occurrence, today) ? fromHomework.occurrence.id : undefined}
      />
    );
  }
  const sessionStart = client.booking
    ? client.booking.startsAt
    : place.side === "trainer" && bookingId
      ? await loadBookingStart(bookingId, place.coachingId)
      : null;
  const logBookingId = client.booking?.id ?? bookingId;
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
      coachingId={place.side === "trainer" ? place.coachingId : client.booking?.coachingId}
      bookingId={sessionStart ? logBookingId : undefined}
      sessionStart={sessionStart ?? undefined}
      timeZone={timeZone}
      initial={initial}
      hrefBase={hrefBase(place)}
      templates={place.side === "trainer"}
    />
  );
}

/**
 * "Новая тренировка"; the trainer's "?booking=" ties it to a session of the pair (PRD 2.10-4), the client's
 * "?homework=" starts it from a homework deadline (PRD wave-2 §10.2).
 */
export async function NewLogPage({
  place,
  booking,
  homework,
}: {
  place: LogPlace;
  booking: Promise<string | undefined>;
  homework?: Promise<string | undefined>;
}) {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.workouts.editor.newTitle} back={{ fallbackHref: listHref(place) }} />}>
      <Suspense fallback={<Loading t={t} />}>
        <NewLogForm t={t} place={place} booking={booking} homework={homework} />
      </Suspense>
    </Screen>
  );
}

async function EditLogForm({ t, locale, place, logId }: { t: Dictionary; locale: Locale; place: LogPlace; logId: Promise<string> }) {
  const [id, client, timeZone] = await Promise.all([logId, placeClient(place), viewerTimeZone()]);
  const log = client ? await loadLog(id, locale) : null;
  if (!client || !log || !belongs(client, log) || !log.editable) return <NotFound t={t} />;
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
