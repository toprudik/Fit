import type { Metadata } from "next";
import { Inbox } from "lucide-react";
import { Suspense } from "react";
import { ScheduleSignIn } from "@/components/schedule/sign-in-state";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { EmptyState } from "@/components/ui/empty-state";
import { ListGroup, ListRow } from "@/components/ui/list";
import { SkeletonRows } from "@/components/ui/skeleton";
import { INTL_LOCALE } from "@/i18n/config";
import { getDictionary, getLocale } from "@/i18n/server";
import { interpolate } from "@/i18n/format";
import { loadTrainerRequests, type TrainerRequest } from "@/lib/bookings/load";
import { loadScheduleAssists } from "@/lib/delegations/assistant";
import { loadScheduleOwner } from "@/lib/schedule/load";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.schedule.requests.title };
}

/** Request time, outside the component so rendering stays pure. */
function now(): Date {
  return new Date();
}

async function Requests() {
  const [t, locale] = await Promise.all([getDictionary(), getLocale()]);
  const copy = t.schedule.requests;
  const owner = await loadScheduleOwner();
  if (!owner) return <ScheduleSignIn title={copy.title} next="/trainer/requests" />;

  // With the requests of the trainers the caller assists with the schedule, each under its trainer (B8).
  const assists = await loadScheduleAssists(owner);
  const requests = await loadTrainerRequests(owner, now(), undefined, [owner.userId, ...assists.map((assist) => assist.ownerId)]);
  if (requests.length === 0) return <EmptyState icon={Inbox} title={copy.emptyTitle} description={copy.emptyText} />;
  const format = new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    weekday: "short",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: owner.timeZone,
  });
  const rows = (items: TrainerRequest[]) =>
    items.map((request) => (
      <ListRow
        key={request.id}
        avatar={{ name: request.client }}
        title={request.client}
        subtitle={format.format(new Date(request.startsAt))}
        href={`/trainer/requests/${request.id}`}
      />
    ));
  const own = requests.filter((request) => request.trainerId === owner.userId);
  return (
    <div className="flex flex-col gap-6">
      {own.length > 0 ? <ListGroup>{rows(own)}</ListGroup> : null}
      {assists.map((assist) => {
        const theirs = requests.filter((request) => request.trainerId === assist.ownerId);
        return theirs.length > 0 ? (
          <ListGroup key={assist.ownerId} header={interpolate(copy.ownerHeader, { name: assist.ownerName })} headingLevel={2}>
            {rows(theirs)}
          </ListGroup>
        ) : null;
      })}
    </div>
  );
}

/** "Запросы на запись" (PRD 2.6.4): open requests of clients without a fitting pass, soonest first. */
export default async function RequestsPage() {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.schedule.requests.title} back={{ fallbackHref: "/trainer/schedule" }} />}>
      <div className="flex w-full max-w-2xl flex-col pt-4 md:pt-0">
        <Suspense fallback={<SkeletonRows rows={3} label={t.common.loading} />}>
          <Requests />
        </Suspense>
      </div>
    </Screen>
  );
}
