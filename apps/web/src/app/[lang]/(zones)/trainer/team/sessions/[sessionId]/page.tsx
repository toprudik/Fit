import type { Metadata } from "next";
import { CalendarX } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { CheckInQr } from "@/components/check-in/check-in-qr";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { AttendanceMarks } from "@/components/team/team";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ListGroup, ListRow } from "@/components/ui/list";
import { SkeletonRows } from "@/components/ui/skeleton";
import { INTL_LOCALE } from "@/i18n/config";
import { interpolate } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import { loadDelegatedSession } from "@/lib/delegations/load";
import { isPairId } from "@/lib/pairs/clients";

// The shell reads the route segments (AppShell), and a session id is known only at request time.
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.team.session.title };
}

/** Request time, outside the component so rendering stays pure (the page renders per request). */
function requestTime(): number {
  return Date.now();
}

async function DelegatedSession({ params }: { params: PageProps<"/[lang]/trainer/team/sessions/[sessionId]">["params"] }) {
  const [t, locale, { sessionId }] = await Promise.all([getDictionary(), getLocale(), params]);
  const copy = t.team.session;
  const session = isPairId(sessionId) ? await loadDelegatedSession(sessionId) : null;
  if (!session) {
    return (
      <EmptyState
        icon={CalendarX}
        title={copy.notFound}
        description={copy.notFoundText}
        action={
          <Link href="/trainer/team" className={buttonVariants({ variant: "secondary" })}>
            {t.team.accept.back}
          </Link>
        }
      />
    );
  }
  const when = new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    weekday: "short",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: session.timeZone,
  }).format(new Date(session.startsAt));
  const started = Date.parse(session.startsAt) <= requestTime();
  // Check-in opens 30 minutes before the start (PRD wave-3 §5 rule 3); the page itself is gone once the session ends.
  const checkInOpen = session.mode === "offline" && Date.parse(session.startsAt) - 30 * 60_000 <= requestTime();
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1 px-1">
        <h1 className="text-title-2">{session.title ?? when}</h1>
        {session.title ? <p className="text-callout">{when}</p> : null}
        <p className="text-callout text-ink-2">{[interpolate(copy.owner, { name: session.ownerName ?? "" }), session.location].filter(Boolean).join(", ")}</p>
      </div>
      {checkInOpen ? <CheckInQr sessionId={session.id} timeZone={session.timeZone} /> : null}
      <ListGroup header={copy.participants} footer={started ? copy.chargeNote : copy.notStarted} headingLevel={2}>
        {session.participants.length === 0 ? <ListRow title={copy.empty} /> : null}
        {session.participants.map((person) => (
          <ListRow
            key={person.bookingId}
            title={person.name}
            subtitle={person.status in copy.statuses ? copy.statuses[person.status as keyof typeof copy.statuses] : undefined}
            trailing={started ? <AttendanceMarks bookingId={person.bookingId} name={person.name} status={person.status} /> : undefined}
          />
        ))}
      </ListGroup>
    </div>
  );
}

/**
 * A session the caller runs as a substitute (PRD wave-3 §1): the check-in QR (§5), participants and attendance,
 * until it ends (1.5).
 */
export default async function DelegatedSessionPage(props: PageProps<"/[lang]/trainer/team/sessions/[sessionId]">) {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.team.session.title} back={{ fallbackHref: "/trainer/team" }} />}>
      <div className="flex w-full max-w-2xl flex-col pt-4 md:pt-0">
        <Suspense fallback={<SkeletonRows rows={5} label={t.common.loading} />}>
          <DelegatedSession params={props.params} />
        </Suspense>
      </div>
    </Screen>
  );
}
