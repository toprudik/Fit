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
import { loadTrainerRequests } from "@/lib/bookings/load";
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

  const requests = await loadTrainerRequests(owner, now());
  if (requests.length === 0) return <EmptyState icon={Inbox} title={copy.emptyTitle} description={copy.emptyText} />;
  const format = new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    weekday: "short",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: owner.timeZone,
  });
  return (
    <ListGroup>
      {requests.map((request) => (
        <ListRow
          key={request.id}
          avatar={{ name: request.client }}
          title={request.client}
          subtitle={format.format(new Date(request.startsAt))}
          href={`/trainer/requests/${request.id}`}
        />
      ))}
    </ListGroup>
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
