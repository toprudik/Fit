import type { Metadata } from "next";
import { CalendarX } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { BookPicker } from "@/components/bookings/book-picker";
import { ScheduleSignIn } from "@/components/schedule/sign-in-state";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonRows } from "@/components/ui/skeleton";
import { INTL_LOCALE } from "@/i18n/config";
import { interpolate } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import { dayRange } from "@/lib/bookings/book";
import { BOOKING_DAYS, loadBookingPage, loadBookingTrainers, loadClientBooking } from "@/lib/bookings/load";
import { formatMoney } from "@/lib/money/format";
import { isPairId } from "@/lib/pairs/clients";
import { loadScheduleOwner } from "@/lib/schedule/load";
import { loadTrainerZones } from "@/lib/schedule/trainer-zone";
import { today } from "@/lib/schedule/time";

// A booking id is known only at request time, so the page renders on request.
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.schedule.book.moveScreen };
}

/** Request time, outside the component so rendering stays pure. */
function now(): Date {
  return new Date();
}

async function Reschedule({ params }: { params: PageProps<"/[lang]/client/bookings/[bookingId]/reschedule">["params"] }) {
  const [t, locale, { bookingId }] = await Promise.all([getDictionary(), getLocale(), params]);
  const copy = t.schedule.book;
  const owner = await loadScheduleOwner();
  if (!owner) return <ScheduleSignIn title={copy.moveScreen} next={`/client/bookings/${bookingId}/reschedule`} />;

  const at = now();
  const booking = isPairId(bookingId) ? await loadClientBooking(owner, bookingId) : null;
  const movable =
    booking !== null &&
    booking.status === "confirmed" &&
    booking.kind === "personal" &&
    booking.source !== "trial" &&
    booking.freeCancelUntil !== null &&
    booking.freeCancelUntil >= at.toISOString();
  const trainer = movable ? (await loadBookingTrainers(owner)).find((candidate) => candidate.trainerId === booking.trainerId) : undefined;
  if (!booking || !trainer) {
    return (
      <EmptyState
        icon={CalendarX}
        title={t.schedule.booking.notFoundTitle}
        description={t.schedule.booking.lateText}
        action={
          <Button asChild variant="secondary">
            <Link href={booking ? `/client/bookings/${booking.id}` : "/client/sessions"}>{t.schedule.booking.back}</Link>
          </Button>
        }
      />
    );
  }

  const [page, zones] = await Promise.all([loadBookingPage(owner, trainer, at), loadTrainerZones(owner.supabase, [trainer.trainerId])]);
  const intl = INTL_LOCALE[locale];
  const when = new Intl.DateTimeFormat(intl, {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: owner.timeZone,
  });

  return (
    <div className="flex flex-col gap-4">
      <p className="px-1 text-subhead text-ink-2">{interpolate(copy.moveFrom, { when: when.format(new Date(booking.startsAt)) })}</p>
      {page.slots.length === 0 ? (
        <EmptyState icon={CalendarX} title={copy.noSlotsTitle} description={copy.noSlotsText} />
      ) : (
        <BookPicker
          timeZone={owner.timeZone}
          trainerTimeZone={zones.get(trainer.trainerId)}
          days={dayRange(today(owner.timeZone), BOOKING_DAYS)}
          slots={page.slots}
          // Only a personal booking moves, and only to a personal slot.
          groups={[]}
          // The booking being moved is not a clash with its new time.
          busy={page.busy.filter((item) => item.startsAt !== booking.startsAt || item.endsAt !== booking.endsAt)}
          dropInText={
            page.dropIn ? interpolate(copy.dropInPrice, { price: formatMoney(locale, page.dropIn.priceMinor, page.dropIn.currency) }) : null
          }
          paymentLinks={page.paymentLinks}
          moveBookingId={booking.id}
        />
      )}
    </div>
  );
}

/** "Перенос записи" (PRD 2.6.5): a free slot of the same trainer replaces a confirmed booking before its deadline. */
export default async function ReschedulePage(props: PageProps<"/[lang]/client/bookings/[bookingId]/reschedule">) {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.schedule.book.moveScreen} back={{ fallbackHref: "/client/sessions" }} />}>
      <div className="flex w-full max-w-2xl flex-col pt-4 md:pt-0">
        <Suspense fallback={<SkeletonRows rows={4} label={t.common.loading} />}>
          <Reschedule params={props.params} />
        </Suspense>
      </div>
    </Screen>
  );
}
