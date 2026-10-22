import type { Metadata } from "next";
import { CalendarDays, Plus } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { BookingSegments } from "@/components/bookings/booking-segments";
import { ClientHomeworkRow } from "@/components/homework/client-homework";
import { ScheduleSignIn } from "@/components/schedule/sign-in-state";
import { DetailPlaceholder, MasterDetail, Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ListGroup, ListRow } from "@/components/ui/list";
import { Skeleton, SkeletonRows, SkeletonScreen, SkeletonSegments } from "@/components/ui/skeleton";
import { INTL_LOCALE } from "@/i18n/config";
import { interpolate } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import { bookingTone, segmentBookings } from "@/lib/bookings/book";
import { findSessionBooking, loadClientBookings, type ClientBooking } from "@/lib/bookings/load";
import { isPairId } from "@/lib/pairs/clients";
import { loadScheduleOwner } from "@/lib/schedule/load";
import { trainerClock } from "@/lib/schedule/trainer-clock";
import { loadTrainerZones } from "@/lib/schedule/trainer-zone";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.tabs.client.sessions };
}

/** Request time, outside the component so rendering stays pure. */
function now(): Date {
  return new Date();
}

async function Bookings({ searchParams }: { searchParams: PageProps<"/[lang]/client/sessions">["searchParams"] }) {
  const [t, locale, params] = await Promise.all([getDictionary(), getLocale(), searchParams]);
  // The bot links here with ?booking=<id> (reminder) or ?session=<id> (the trainer set or changed a session), plus
  // ?action=cancel for «Отменить»: open that booking, with the cancel sheet.
  const action = params.action === "cancel" ? "?action=cancel" : "";
  if (isPairId(params.booking)) redirect(`/client/bookings/${params.booking}${action}`);
  const copy = t.schedule.clientSessions;
  const owner = await loadScheduleOwner();
  if (!owner) return <ScheduleSignIn title={t.tabs.client.sessions} next="/client/sessions" />;
  if (isPairId(params.session)) {
    const booking = await findSessionBooking(owner, params.session);
    if (booking) redirect(`/client/bookings/${booking}${action}`);
  }

  const bookings = await loadClientBookings(owner);
  const { upcoming, past, requests } = segmentBookings(bookings, now());
  const zones = await loadTrainerZones(owner.supabase, bookings.map((booking) => booking.trainerId));
  const subtitle = (booking: ClientBooking) => {
    const name =
      booking.substitute !== null
        ? interpolate(copy.substitute, { name: booking.substitute || t.schedule.booking.trainer })
        : booking.trainer
          ? interpolate(copy.trainer, { name: booking.trainer })
          : null;
    const clock = trainerClock(booking, owner.timeZone, zones.get(booking.trainerId), INTL_LOCALE[locale]);
    const caption = clock ? interpolate(t.schedule.trainerTime, { time: clock }) : null;
    return [name, caption].filter(Boolean).join(" · ") || undefined;
  };
  const format = new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: owner.timeZone,
  });
  const list = (items: ClientBooking[], empty: React.ReactNode) =>
    items.length === 0 ? (
      empty
    ) : (
      <ListGroup>
        {items.map((booking) => (
          <ListRow
            key={booking.id}
            icon={CalendarDays}
            title={format.format(new Date(booking.startsAt))}
            subtitle={subtitle(booking)}
            trailing={
              booking.status === "confirmed" ? undefined : <Badge tone={bookingTone(booking.status)}>{copy.status[booking.status]}</Badge>
            }
            href={`/client/bookings/${booking.id}`}
          />
        ))}
      </ListGroup>
    );
  const bookButton = (
    <Button asChild>
      <Link href="/client/book">{copy.book}</Link>
    </Button>
  );

  return (
    <div className="flex flex-col gap-4">
      <ClientHomeworkRow />
      {upcoming.length + past.length + requests.length > 0 ? (
        <Button asChild variant="secondary" className="self-start">
          <Link href="/client/book">
            <Plus aria-hidden size={18} />
            {copy.book}
          </Link>
        </Button>
      ) : null}
      <BookingSegments
        initial={upcoming.length === 0 && requests.length > 0 ? "requests" : "upcoming"}
        panels={{
          upcoming: list(
            upcoming,
            <EmptyState icon={CalendarDays} title={copy.emptyUpcomingTitle} description={copy.emptyUpcomingText} action={bookButton} />,
          ),
          past: list(past, <EmptyState icon={CalendarDays} title={copy.emptyPastTitle} />),
          requests: list(requests, <EmptyState icon={CalendarDays} title={copy.emptyRequestsTitle} description={copy.emptyRequestsText} />),
        }}
      />
    </div>
  );
}

/** "Занятия" of the client (screens.md /client/sessions, PRD 2.6.4-7): bookings with every trainer. */
export default async function ClientSessionsPage(props: PageProps<"/[lang]/client/sessions">) {
  const t = await getDictionary();
  return (
    <MasterDetail
      list={
        <Screen header={<ScreenHeader title={t.tabs.client.sessions} />}>
          <Suspense
            fallback={
              <SkeletonScreen label={t.common.loading}>
                <Skeleton className="h-11 w-36 rounded-full" />
                <SkeletonSegments />
                <SkeletonRows rows={2} />
              </SkeletonScreen>
            }
          >
            <Bookings searchParams={props.searchParams} />
          </Suspense>
        </Screen>
      }
      detail={<DetailPlaceholder icon={CalendarDays} text={t.screens.client.sessions.detail} />}
    />
  );
}
