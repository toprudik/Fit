import type { Metadata } from "next";
import { CalendarX } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { SessionForm } from "@/components/schedule/session-form";
import { ScheduleSignIn } from "@/components/schedule/sign-in-state";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonRows } from "@/components/ui/skeleton";
import { getDictionary } from "@/i18n/server";
import { isPairId } from "@/lib/pairs/clients";
import { loadScheduleOwner, loadSession, loadSessionFormData } from "@/lib/schedule/load";
import { formatMinutes, localParts, today as todayIn } from "@/lib/schedule/time";

// A session id is known only at request time, so the page renders on request.
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.schedule.sessionForm.editTitle };
}

/** Request time, outside the component so rendering stays pure. */
function now(): string {
  return new Date().toISOString();
}

async function EditSession({ params }: { params: PageProps<"/[lang]/trainer/sessions/[sessionId]/edit">["params"] }) {
  const [t, { sessionId }] = await Promise.all([getDictionary(), params]);
  const copy = t.schedule.sessionPage;
  const owner = await loadScheduleOwner();
  if (!owner) return <ScheduleSignIn title={t.schedule.sessionForm.editTitle} next={`/trainer/sessions/${sessionId}/edit`} />;

  const session = isPairId(sessionId) ? await loadSession(owner, sessionId) : null;
  if (!session || session.kind === "trial" || session.status !== "scheduled" || session.startsAt <= now()) {
    return (
      <EmptyState
        icon={CalendarX}
        title={session ? t.schedule.sessionForm.errors.not_editable : copy.notFoundTitle}
        description={session ? undefined : copy.notFoundText}
        action={
          <Button asChild variant="secondary">
            <Link href={session ? `/trainer/sessions/${session.id}` : "/trainer/schedule"}>
              {session ? copy.title : copy.backToSchedule}
            </Link>
          </Button>
        }
      />
    );
  }

  const data = await loadSessionFormData(owner);
  const start = localParts(session.startsAt, owner.timeZone);
  return (
    <SessionForm
      kind="edit"
      sessionId={session.id}
      inRepeat={Boolean(session.repeat && !session.repeat.ended)}
      group={session.kind === "group"}
      clients={data.clients}
      locations={data.locations}
      timeZone={owner.timeZone}
      today={todayIn(owner.timeZone)}
      initial={{
        coachingId: session.clients[0]?.coachingId ?? "",
        day: start.day,
        time: formatMinutes(start.minutes),
        durationMin: Math.round((Date.parse(session.endsAt) - Date.parse(session.startsAt)) / 60_000),
        mode: session.mode,
        locationId: session.location?.id ?? null,
        meetingUrl: session.meetingUrl ?? "",
        title: session.title ?? "",
      }}
    />
  );
}

/** "Изменить занятие" (screens.md /trainer/sessions/[id]/edit, PRD 2.6.5-5): move it or change where it happens. */
export default async function EditSessionPage(props: PageProps<"/[lang]/trainer/sessions/[sessionId]/edit">) {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.schedule.sessionForm.editTitle} back={{ fallbackHref: "/trainer/schedule" }} />}>
      <div className="flex w-full max-w-2xl flex-col pt-4 md:pt-0">
        <Suspense fallback={<SkeletonRows rows={5} label={t.common.loading} />}>
          <EditSession params={props.params} />
        </Suspense>
      </div>
    </Screen>
  );
}
