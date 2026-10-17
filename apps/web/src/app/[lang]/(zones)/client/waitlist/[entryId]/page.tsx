import type { Metadata } from "next";
import { CalendarX, Clock, Link2, MapPin, UserRound } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { WaitlistActions } from "@/components/bookings/waitlist-actions";
import { ScheduleSignIn } from "@/components/schedule/sign-in-state";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ListGroup, ListRow } from "@/components/ui/list";
import { SkeletonRows } from "@/components/ui/skeleton";
import { INTL_LOCALE } from "@/i18n/config";
import { interpolate } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import { loadWaitlistEntry } from "@/lib/bookings/load";
import { isPairId } from "@/lib/pairs/clients";
import { loadScheduleOwner } from "@/lib/schedule/load";

// An entry id is known only at request time, so the page renders on request.
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.schedule.waitlist.title };
}

async function EntryDetails({ params }: { params: PageProps<"/[lang]/client/waitlist/[entryId]">["params"] }) {
  const [t, locale, { entryId }] = await Promise.all([getDictionary(), getLocale(), params]);
  const copy = t.schedule.waitlist;
  const owner = await loadScheduleOwner();
  if (!owner) return <ScheduleSignIn title={copy.title} next={`/client/waitlist/${entryId}`} />;

  const entry = isPairId(entryId) ? await loadWaitlistEntry(owner, entryId) : null;
  if (!entry) {
    return (
      <EmptyState
        icon={CalendarX}
        title={copy.notFoundTitle}
        description={copy.notFoundText}
        action={
          <Button asChild variant="secondary">
            <Link href="/client/book">{copy.toBooking}</Link>
          </Button>
        }
      />
    );
  }

  const intl = INTL_LOCALE[locale];
  const day = new Intl.DateTimeFormat(intl, { weekday: "long", day: "numeric", month: "long", timeZone: owner.timeZone });
  const time = new Intl.DateTimeFormat(intl, { hour: "2-digit", minute: "2-digit", timeZone: owner.timeZone });
  const { session } = entry;
  const book = t.schedule.book;
  const offered = entry.status === "offered";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 px-1">
        <h2 className="text-title-2">{session.title || day.format(new Date(session.startsAt))}</h2>
      </div>

      <ListGroup>
        <ListRow
          icon={Clock}
          title={day.format(new Date(session.startsAt))}
          subtitle={
            <span className="tabular-nums">{`${time.format(new Date(session.startsAt))}–${time.format(new Date(session.endsAt))}`}</span>
          }
        />
        {session.mode === "online" ? (
          <ListRow icon={Link2} title={t.schedule.templatePage.online} />
        ) : (
          <ListRow icon={MapPin} title={t.schedule.templatePage.offline} subtitle={session.place ?? t.schedule.sessionPage.noPlace} />
        )}
        <ListRow
          icon={UserRound}
          title={entry.trainer || t.schedule.booking.trainer}
          subtitle={entry.trainer ? t.schedule.booking.trainer : undefined}
        />
      </ListGroup>

      {entry.status === "waiting" ? (
        <div className="flex flex-col gap-1 px-1">
          <h3 className="text-headline">{copy.placeTitle}</h3>
          <p className="text-subhead text-ink-2">{interpolate(copy.placeText, { place: String(entry.place ?? 1) })}</p>
        </div>
      ) : null}

      {offered ? (
        <div className="flex flex-col gap-2 px-1">
          <h3 className="text-headline">{copy.offerTitle}</h3>
          {entry.offerExpiresAt ? (
            <p className="text-subhead text-ink-2">{interpolate(copy.offerUntil, { time: time.format(new Date(entry.offerExpiresAt)) })}</p>
          ) : null}
          <p className="text-subhead text-ink-2">
            {entry.passTitle
              ? interpolate(book.passLine, { title: entry.passTitle, count: String(entry.sessionsLeft ?? 0) })
              : entry.confirmed
                ? book.debtLine
                : book.requestLine}
          </p>
          {entry.insideDeadline ? <p className="text-subhead text-ink">{copy.lateWarning}</p> : null}
        </div>
      ) : null}

      {entry.status !== "waiting" && entry.status !== "offered" ? (
        <div className="flex flex-col gap-3">
          <p className="px-1 text-subhead text-ink-2">{copy.status[entry.status]}</p>
          <Button asChild variant="secondary" block>
            <Link href={entry.bookingId ? `/client/bookings/${entry.bookingId}` : "/client/book"}>
              {entry.bookingId ? copy.openBooking : copy.toBooking}
            </Link>
          </Button>
        </div>
      ) : (
        <WaitlistActions entryId={entry.id} status={offered ? "offered" : "waiting"} request={offered && !entry.confirmed} />
      )}
    </div>
  );
}

/** "Лист ожидания" (screens.md /client/waitlist/[entryId], PRD wave-2 §9): a place in the queue or an offered seat. */
export default async function WaitlistEntryPage(props: PageProps<"/[lang]/client/waitlist/[entryId]">) {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.schedule.waitlist.title} back={{ fallbackHref: "/client/book" }} />}>
      <div className="flex w-full max-w-2xl flex-col pt-4 md:pt-0">
        <Suspense fallback={<SkeletonRows rows={4} label={t.common.loading} />}>
          <EntryDetails params={props.params} />
        </Suspense>
      </div>
    </Screen>
  );
}
