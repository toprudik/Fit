import type { Metadata } from "next";
import { CalendarClock, CalendarX, Clock, Link2, MapPin, MessageCircle, UserRound } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { CancelBooking } from "@/components/bookings/cancel-booking";
import { WithdrawRequest } from "@/components/bookings/withdraw-request";
import { ScheduleSignIn } from "@/components/schedule/sign-in-state";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ListGroup, ListRow } from "@/components/ui/list";
import { SkeletonRows } from "@/components/ui/skeleton";
import { INTL_LOCALE } from "@/i18n/config";
import { interpolate } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import { bookingTone } from "@/lib/bookings/book";
import { loadClientBooking } from "@/lib/bookings/load";
import { isPairId } from "@/lib/pairs/clients";
import { loadScheduleOwner } from "@/lib/schedule/load";

// A booking id is known only at request time, so the page renders on request.
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.schedule.booking.title };
}

/** Request time, outside the component so rendering stays pure. */
function now(): string {
  return new Date().toISOString();
}

async function BookingDetails({ params }: { params: PageProps<"/[lang]/client/bookings/[bookingId]">["params"] }) {
  const [t, locale, { bookingId }] = await Promise.all([getDictionary(), getLocale(), params]);
  const copy = t.schedule.booking;
  const owner = await loadScheduleOwner();
  if (!owner) return <ScheduleSignIn title={copy.title} next={`/client/bookings/${bookingId}`} />;

  const booking = isPairId(bookingId) ? await loadClientBooking(owner, bookingId) : null;
  if (!booking) {
    return (
      <EmptyState
        icon={CalendarX}
        title={copy.notFoundTitle}
        description={copy.notFoundText}
        action={
          <Button asChild variant="secondary">
            <Link href="/client/sessions">{copy.back}</Link>
          </Button>
        }
      />
    );
  }

  const intl = INTL_LOCALE[locale];
  const day = new Intl.DateTimeFormat(intl, { weekday: "long", day: "numeric", month: "long", timeZone: owner.timeZone });
  const time = new Intl.DateTimeFormat(intl, { hour: "2-digit", minute: "2-digit", timeZone: owner.timeZone });
  const deadline = new Intl.DateTimeFormat(intl, {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: owner.timeZone,
  });
  const at = now();
  const ahead = booking.startsAt > at;
  const live = booking.status === "confirmed" && ahead;
  const free = live && booking.freeCancelUntil !== null && booking.freeCancelUntil >= at;
  const deadlineText = booking.freeCancelUntil ? deadline.format(new Date(booking.freeCancelUntil)) : null;
  // A trial or group booking is cancelled, not moved (PRD 2.6.5).
  const movable = free && booking.kind === "personal" && booking.source !== "trial";
  const place = t.schedule.sessionPage;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 px-1">
        <h2 className="text-title-2">{booking.title ?? day.format(new Date(booking.startsAt))}</h2>
        <div>
          <Badge tone={bookingTone(booking.status)}>{t.schedule.clientSessions.status[booking.status]}</Badge>
        </div>
      </div>

      {booking.status === "requested" && ahead ? <p className="px-1 text-subhead text-ink-2">{copy.requestText}</p> : null}

      <ListGroup>
        <ListRow
          icon={Clock}
          title={day.format(new Date(booking.startsAt))}
          subtitle={
            <span className="tabular-nums">{`${time.format(new Date(booking.startsAt))}–${time.format(new Date(booking.endsAt))}`}</span>
          }
        />
        {booking.mode === "online" ? (
          <ListRow
            icon={Link2}
            title={t.schedule.templatePage.online}
            subtitle={
              booking.meetingUrl ? (
                <a href={booking.meetingUrl} target="_blank" rel="noreferrer" className="break-all text-accent-ink underline">
                  {booking.meetingUrl}
                </a>
              ) : undefined
            }
          />
        ) : (
          <ListRow
            icon={MapPin}
            title={t.schedule.templatePage.offline}
            subtitle={booking.location ? [booking.location.name, booking.location.address].filter(Boolean).join(", ") : place.noPlace}
          />
        )}
        <ListRow icon={UserRound} title={booking.trainer || copy.trainer} subtitle={booking.trainer ? copy.trainer : undefined} />
      </ListGroup>

      {booking.cancelReason && ["cancelled", "declined", "late_cancelled"].includes(booking.status) ? (
        <ListGroup header={copy.reason}>
          <ListRow title={booking.cancelReason} />
        </ListGroup>
      ) : null}

      {live && deadlineText ? (
        <p className="px-1 text-subhead text-ink-2">{free ? interpolate(copy.deadline, { date: deadlineText }) : copy.lateText}</p>
      ) : null}

      <div className="flex flex-col gap-2">
        {booking.status === "requested" && ahead ? <WithdrawRequest bookingId={booking.id} /> : null}
        {movable ? (
          <Button asChild variant="secondary" block>
            <Link href={`/client/bookings/${booking.id}/reschedule`}>
              <CalendarClock aria-hidden size={18} />
              {copy.reschedule}
            </Link>
          </Button>
        ) : null}
        {live ? <CancelBooking bookingId={booking.id} late={!free} deadline={deadlineText} /> : null}
        {booking.trainerUsername ? (
          <Button asChild variant="secondary" block>
            <a href={`https://t.me/${booking.trainerUsername}`} target="_blank" rel="noreferrer">
              <MessageCircle aria-hidden size={18} />
              {copy.writeTrainer}
            </a>
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * "Запись" (screens.md /client/bookings/[bookingId]): when, where, with whom; a request can be taken back, a confirmed
 * booking moved or cancelled (PRD 2.6.5).
 */
export default async function BookingPage(props: PageProps<"/[lang]/client/bookings/[bookingId]">) {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.schedule.booking.title} back={{ fallbackHref: "/client/sessions" }} />}>
      <div className="flex w-full max-w-2xl flex-col pt-4 md:pt-0">
        <Suspense fallback={<SkeletonRows rows={4} label={t.common.loading} />}>
          <BookingDetails params={props.params} />
        </Suspense>
      </div>
    </Screen>
  );
}
