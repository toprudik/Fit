import type { Metadata } from "next";
import { CalendarX, UserRound } from "lucide-react";
import { Suspense } from "react";
import { BookPicker } from "@/components/bookings/book-picker";
import { ScheduleSignIn } from "@/components/schedule/sign-in-state";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { Button } from "@/components/ui/button";
import { Chip, ChipRow } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { ListGroup, ListRow } from "@/components/ui/list";
import { SkeletonRows } from "@/components/ui/skeleton";
import { interpolate } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import { BOOKING_DAYS, loadBookingPage, loadBookingTrainers } from "@/lib/bookings/load";
import { dayRange } from "@/lib/bookings/book";
import { formatMoney } from "@/lib/money/format";
import { loadScheduleOwner } from "@/lib/schedule/load";
import { today } from "@/lib/schedule/time";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.schedule.book.title };
}

/** Request time, outside the component so rendering stays pure. */
function now(): Date {
  return new Date();
}

async function Booking({ searchParams }: { searchParams: PageProps<"/[lang]/client/book">["searchParams"] }) {
  const [t, locale, params] = await Promise.all([getDictionary(), getLocale(), searchParams]);
  const copy = t.schedule.book;
  const owner = await loadScheduleOwner();
  if (!owner) return <ScheduleSignIn title={copy.title} next="/client/book" />;

  const trainers = await loadBookingTrainers(owner);
  if (trainers.length === 0) {
    return <EmptyState icon={UserRound} title={copy.noTrainersTitle} description={copy.noTrainersText} />;
  }
  const trainer = trainers.find((candidate) => candidate.coachingId === params.coaching) ?? (trainers.length === 1 ? trainers[0] : null);
  if (!trainer) {
    return (
      <ListGroup header={copy.chooseTrainer}>
        {trainers.map((candidate) => (
          <ListRow
            key={candidate.coachingId}
            avatar={{ name: candidate.name }}
            title={candidate.name}
            href={`/client/book?coaching=${candidate.coachingId}`}
          />
        ))}
      </ListGroup>
    );
  }

  const at = now();
  const page = await loadBookingPage(owner, trainer, at);
  const switcher =
    trainers.length > 1 ? (
      <ChipRow label={copy.chooseTrainer}>
        {trainers.map((candidate) => (
          <Chip key={candidate.coachingId} selected={candidate === trainer} href={`/client/book?coaching=${candidate.coachingId}`}>
            {candidate.name}
          </Chip>
        ))}
      </ChipRow>
    ) : null;

  if (page.slots.length === 0 && page.groups.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {switcher}
        <EmptyState
          icon={CalendarX}
          title={copy.noSlotsTitle}
          description={copy.noSlotsText}
          action={
            trainer.username ? (
              <Button asChild variant="secondary">
                <a href={`https://t.me/${trainer.username}`} target="_blank" rel="noreferrer">
                  {copy.writeTrainer}
                </a>
              </Button>
            ) : undefined
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {switcher}
      <BookPicker
        timeZone={owner.timeZone}
        days={dayRange(today(owner.timeZone), BOOKING_DAYS)}
        slots={page.slots}
        groups={page.groups}
        busy={page.busy}
        dropInText={
          page.dropIn ? interpolate(copy.dropInPrice, { price: formatMoney(locale, page.dropIn.priceMinor, page.dropIn.currency) }) : null
        }
        paymentLinks={page.paymentLinks}
      />
    </div>
  );
}

/** "Запись на занятие" (screens.md /client/book?coaching=, PRD 2.6.4): free slots of a trainer for two weeks. */
export default async function BookPage(props: PageProps<"/[lang]/client/book">) {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.schedule.book.title} back={{ fallbackHref: "/client/sessions" }} />}>
      <div className="flex w-full max-w-2xl flex-col pt-4 md:pt-0">
        <Suspense fallback={<SkeletonRows rows={4} label={t.common.loading} />}>
          <Booking searchParams={props.searchParams} />
        </Suspense>
      </div>
    </Screen>
  );
}
