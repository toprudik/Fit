import type { Metadata } from "next";
import { CalendarX, ClipboardList, Dumbbell, Plus } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ListGroup, ListRow } from "@/components/ui/list";
import { SkeletonRows } from "@/components/ui/skeleton";
import { getDictionary, getLocale } from "@/i18n/server";
import { formatSessionTime } from "@/lib/pairs/format";
import { loadSubstituteParticipant, substitutePath } from "@/lib/workouts/substitute";

// The shell reads the route segments (AppShell), and the ids are known only at request time.
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.substitute.title };
}

async function Participant({ params }: { params: PageProps<"/[lang]/trainer/team/sessions/[sessionId]/bookings/[bookingId]">["params"] }) {
  const [t, locale, { sessionId, bookingId }] = await Promise.all([getDictionary(), getLocale(), params]);
  const participant = await loadSubstituteParticipant(sessionId, bookingId);
  if (!participant) {
    return (
      <EmptyState
        icon={CalendarX}
        title={t.team.session.notFound}
        description={t.team.session.notFoundText}
        action={
          <Link href="/trainer/team" className={buttonVariants({ variant: "secondary" })}>
            {t.team.accept.back}
          </Link>
        }
      />
    );
  }
  const path = substitutePath(sessionId, bookingId);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1 px-1">
        <h1 className="text-title-2">{participant.name}</h1>
        <p className="text-callout text-ink-2">{formatSessionTime(locale, participant.startsAt, participant.timeZone)}</p>
      </div>
      <ListGroup header={t.substitute.logs} footer={t.substitute.logsFooter} headingLevel={2}>
        {participant.logs.map((log) => (
          <ListRow
            key={log.id}
            icon={Dumbbell}
            title={log.title || t.workouts.logs.untitled}
            subtitle={formatSessionTime(locale, log.performedAt, participant.timeZone)}
            href={`${path}/log/${log.id}`}
          />
        ))}
        {participant.live ? <ListRow icon={Plus} title={t.workouts.logs.new} href={`${path}/log/new`} /> : null}
        {!participant.live && !participant.logs.length ? <ListRow title={t.substitute.noLogs} /> : null}
      </ListGroup>
      <ListGroup footer={t.substitute.intakeFooter}>
        <ListRow icon={ClipboardList} title={t.intake.trainer.title} href={`${path}/intake`} />
      </ListGroup>
    </div>
  );
}

/** A participant of the session the caller substitutes on: the session's log and the intake (PRD wave-3 §1 "Подмена" rule 4). */
export default async function SubstituteParticipantPage(props: PageProps<"/[lang]/trainer/team/sessions/[sessionId]/bookings/[bookingId]">) {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.substitute.title} back={{ fallbackHref: "/trainer/team" }} />}>
      <div className="flex w-full max-w-2xl flex-col pt-4 md:pt-0">
        <Suspense fallback={<SkeletonRows rows={4} label={t.common.loading} />}>
          <Participant params={props.params} />
        </Suspense>
      </div>
    </Screen>
  );
}
