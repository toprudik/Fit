import type { Metadata } from "next";
import { Clock, Inbox, Link2, MapPin, Wallet } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { BookingHistory } from "@/components/bookings/booking-history";
import { DecideRequest } from "@/components/bookings/decide-request";
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
import { loadBookingHistory } from "@/lib/bookings/history";
import { loadTrainerRequest } from "@/lib/bookings/load";
import { loadScheduleAssists } from "@/lib/delegations/assistant";
import { isPairId } from "@/lib/pairs/clients";
import { loadScheduleOwner } from "@/lib/schedule/load";
import { formatTrialPrice } from "@/lib/trial-links/link";

// A booking id is known only at request time, so the page renders on request.
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.schedule.requests.detailTitle };
}

/** Request time, outside the component so rendering stays pure. */
function now(): Date {
  return new Date();
}

async function RequestDetails({ params }: { params: PageProps<"/[lang]/trainer/requests/[bookingId]">["params"] }) {
  const [t, locale, { bookingId }] = await Promise.all([getDictionary(), getLocale(), params]);
  const copy = t.schedule.requests;
  const owner = await loadScheduleOwner();
  if (!owner) return <ScheduleSignIn title={copy.detailTitle} next={`/trainer/requests/${bookingId}`} />;

  const assists = await loadScheduleAssists(owner);
  const request = isPairId(bookingId)
    ? await loadTrainerRequest(owner, bookingId, now(), [owner.userId, ...assists.map((assist) => assist.ownerId)])
    : null;
  if (!request) {
    return (
      <EmptyState
        icon={Inbox}
        title={copy.notFoundTitle}
        description={copy.notFoundText}
        action={
          <Button asChild variant="secondary">
            <Link href="/trainer/requests">{copy.back}</Link>
          </Button>
        }
      />
    );
  }

  // A request for a trainer the caller assists: the client's card is the delegated one, and no money shows (B8).
  const assisted = assists.find((assist) => assist.ownerId === request.trainerId);
  const intl = INTL_LOCALE[locale];
  const day = new Intl.DateTimeFormat(intl, { weekday: "long", day: "numeric", month: "long", timeZone: owner.timeZone });
  const time = new Intl.DateTimeFormat(intl, { hour: "2-digit", minute: "2-digit", timeZone: owner.timeZone });

  return (
    <div className="flex flex-col gap-6">
      <ListGroup header={copy.client}>
        <ListRow
          avatar={{ name: request.client }}
          title={request.client}
          subtitle={assisted ? interpolate(t.delegatedZone.clientOf, { name: assisted.ownerName }) : undefined}
          href={assisted ? `/trainer/clients/delegated/${request.coachingId}` : `/trainer/clients/${request.coachingId}`}
        />
      </ListGroup>

      <ListGroup>
        <ListRow
          icon={Clock}
          title={day.format(new Date(request.startsAt))}
          subtitle={
            <span className="tabular-nums">{`${time.format(new Date(request.startsAt))}–${time.format(new Date(request.endsAt))}`}</span>
          }
        />
        <ListRow
          icon={request.mode === "online" ? Link2 : MapPin}
          title={request.mode === "online" ? t.schedule.templatePage.online : t.schedule.templatePage.offline}
          subtitle={request.mode === "offline" ? (request.place ?? t.schedule.sessionPage.noPlace) : undefined}
        />
      </ListGroup>

      {assisted ? null : (
        <div className="flex gap-3 px-1 text-subhead text-ink-2">
          <Wallet aria-hidden size={20} className="shrink-0" />
          {request.trial ? (
            <p>
              {interpolate(copy.trialLine, {
                title: request.trial.title,
                price:
                  request.trial.priceMinor === 0
                    ? copy.trialFree
                    : formatTrialPrice(locale, request.trial.priceMinor, request.trial.currency),
              })}
            </p>
          ) : (
            <p>
              {request.availableSessions > 0 ? interpolate(copy.passLine, { count: request.availableSessions }) : copy.debtLine}
              {request.debtSessions > 0 ? ` ${interpolate(copy.debtNow, { count: request.debtSessions })}` : null}
            </p>
          )}
        </div>
      )}

      <BookingHistory items={await loadBookingHistory(owner, [request.id])} timeZone={owner.timeZone} />

      <DecideRequest bookingId={request.id} single={!assisted && !request.trial && request.availableSessions === 0} />
    </div>
  );
}

/** "Запрос на запись" (screens.md /trainer/requests/[bookingId], PRD 2.6.4): the client, the time and the balance. */
export default async function RequestPage(props: PageProps<"/[lang]/trainer/requests/[bookingId]">) {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.schedule.requests.detailTitle} back={{ fallbackHref: "/trainer/requests" }} />}>
      <div className="flex w-full max-w-2xl flex-col pt-4 md:pt-0">
        <Suspense fallback={<SkeletonRows rows={4} label={t.common.loading} />}>
          <RequestDetails params={props.params} />
        </Suspense>
      </div>
    </Screen>
  );
}
