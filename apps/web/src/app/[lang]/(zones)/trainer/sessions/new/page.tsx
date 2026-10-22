import type { Metadata } from "next";
import { Users } from "lucide-react";
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
import { loadScheduleOwner, loadSessionFormData } from "@/lib/schedule/load";
import { addDays, formatMinutes, localParts, parseDay, parseMinutes, today as todayIn } from "@/lib/schedule/time";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.schedule.sessionForm.newTitle };
}

/** Request time, outside the component so rendering stays pure. */
function now(): Date {
  return new Date();
}

async function NewSession({ searchParams }: { searchParams: PageProps<"/[lang]/trainer/sessions/new">["searchParams"] }) {
  const [t, params] = await Promise.all([getDictionary(), searchParams]);
  const copy = t.schedule.sessionForm;
  const owner = await loadScheduleOwner();
  if (!owner) return <ScheduleSignIn title={copy.newTitle} next="/trainer/sessions/new" />;

  const data = await loadSessionFormData(owner);
  // ?kind=group opens the group form; a group needs no clients (PRD 2.6.3).
  const initialType = params.kind === "group" ? "group" : "personal";
  if (data.clients.length === 0 && initialType === "personal") {
    return (
      <EmptyState
        icon={Users}
        title={copy.noClientsTitle}
        description={copy.noClientsText}
        action={
          <div className="flex flex-col gap-2">
            <Button asChild>
              <Link href="/trainer/clients">{copy.noClientsAction}</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/trainer/sessions/new?kind=group">{t.schedule.groupSession.createGroup}</Link>
            </Button>
          </div>
        }
      />
    );
  }

  // ?client=, ?date= and ?time= come from a pair card or a free slot in the schedule.
  const today = todayIn(data.timeZone);
  const askedDay = parseDay(params.date);
  // A past day opens a personal session straight in "record a past session", within the same year the date field allows.
  const earliest = initialType === "personal" ? addDays(today, -365) : today;
  const day = askedDay && askedDay >= earliest ? askedDay : today;
  const askedTime = parseMinutes(params.time);
  // Without a time: the next whole hour, or 09:00 on a later day.
  const current = localParts(now(), data.timeZone);
  const fallback = day === today ? Math.min(Math.floor(current.minutes / 60 + 1) * 60, 23 * 60) : 9 * 60;
  const client = typeof params.client === "string" && data.clients.some((pair) => pair.coachingId === params.client) ? params.client : "";

  return (
    <SessionForm
      kind="create"
      initialType={initialType}
      clients={data.clients}
      locations={data.locations}
      timeZone={data.timeZone}
      today={today}
      initial={{
        coachingId: client || (data.clients.length === 1 ? data.clients[0].coachingId : ""),
        day,
        time: formatMinutes(askedTime ?? fallback),
        durationMin: 60,
        mode: data.defaultMode,
        locationId: null,
        meetingUrl: "",
        title: "",
      }}
    />
  );
}

/**
 * "Новое занятие" (screens.md /trainer/sessions/new, PRD 2.6.2, 2.6.3): the trainer books a client in, confirmed
 * at once, or creates a group with seats.
 */
export default async function NewSessionPage(props: PageProps<"/[lang]/trainer/sessions/new">) {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.schedule.sessionForm.newTitle} back={{ fallbackHref: "/trainer/schedule" }} />}>
      <div className="flex w-full max-w-2xl flex-col pt-4 md:pt-0">
        <Suspense fallback={<SkeletonRows rows={5} label={t.common.loading} />}>
          <NewSession searchParams={props.searchParams} />
        </Suspense>
      </div>
    </Screen>
  );
}
