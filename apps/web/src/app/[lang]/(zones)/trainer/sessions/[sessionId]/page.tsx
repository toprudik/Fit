import type { Metadata } from "next";
import { CalendarX, Clock, Link2, MapPin, Repeat, User, Users } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { BookingHistory } from "@/components/bookings/booking-history";
import { CheckInQr } from "@/components/check-in/check-in-qr";
import { AttendanceMarks } from "@/components/passes/attendance-marks";
import { SessionWaivers } from "@/components/passes/session-waivers";
import { CancelSession } from "@/components/schedule/cancel-session";
import { GroupControls } from "@/components/schedule/group-controls";
import { ScheduleSignIn } from "@/components/schedule/sign-in-state";
import { WaitlistQueue } from "@/components/schedule/waitlist-queue";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { RevokeButton, SubstituteButton } from "@/components/team/team";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ListGroup, ListRow } from "@/components/ui/list";
import { SkeletonRows } from "@/components/ui/skeleton";
import { INTL_LOCALE } from "@/i18n/config";
import { interpolate } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import { loadBookingHistory } from "@/lib/bookings/history";
import { loadSlotWaitlist } from "@/lib/bookings/slot-waitlist";
import { loadSessionDelegation } from "@/lib/delegations/load";
import { isPairId } from "@/lib/pairs/clients";
import { loadBookingCharges } from "@/lib/passes/session-charges";
import { loadScheduleOwner, loadSession, loadSessionFormData, loadSessionWaitlist } from "@/lib/schedule/load";

// A session id is known only at request time, so the page renders on request.
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.schedule.sessionPage.title };
}

/** Bookings that hold a seat on a group session; the rest are history. */
const SEAT_STATUSES = new Set(["requested", "confirmed", "attended", "no_show"]);

/** Request time, outside the component so rendering stays pure. */
function now(): string {
  return new Date().toISOString();
}

async function SessionDetails({
  params,
  searchParams,
}: {
  params: PageProps<"/[lang]/trainer/sessions/[sessionId]">["params"];
  searchParams: PageProps<"/[lang]/trainer/sessions/[sessionId]">["searchParams"];
}) {
  const [t, locale, { sessionId }, query] = await Promise.all([getDictionary(), getLocale(), params, searchParams]);
  const copy = t.schedule.sessionPage;
  const owner = await loadScheduleOwner();
  if (!owner) return <ScheduleSignIn title={copy.title} next={`/trainer/sessions/${sessionId}`} />;

  const session = isPairId(sessionId) ? await loadSession(owner, sessionId) : null;
  if (!session) {
    return (
      <EmptyState
        icon={CalendarX}
        title={copy.notFoundTitle}
        description={copy.notFoundText}
        action={
          <Button asChild variant="secondary">
            <Link href="/trainer/schedule">{copy.backToSchedule}</Link>
          </Button>
        }
      />
    );
  }

  const charged = ["attended", "no_show", "late_cancelled"];
  const charges = await loadBookingCharges(
    owner,
    session.clients.filter((client) => charged.includes(client.status)).map((client) => client.bookingId),
  );
  const waiveBooking = query.action === "waive" && typeof query.booking === "string" ? query.booking : null;
  const intl = INTL_LOCALE[locale];
  const day = new Intl.DateTimeFormat(intl, { weekday: "long", day: "numeric", month: "long", timeZone: owner.timeZone });
  const time = new Intl.DateTimeFormat(intl, { hour: "2-digit", minute: "2-digit", timeZone: owner.timeZone });
  const editable = session.status === "scheduled" && session.startsAt > now();
  const inRepeat = Boolean(session.repeat && !session.repeat.ended);
  const title = session.title ?? session.clients[0]?.name ?? t.schedule.session;
  const group = session.kind === "group";
  const groupCopy = t.schedule.groupSession;
  // A group lists the people holding a seat; a personal session keeps its one client whatever happened.
  const participants = group ? session.clients.filter((client) => SEAT_STATUSES.has(client.status)) : session.clients;
  const candidates =
    group && editable
      ? (await loadSessionFormData(owner)).clients.filter(
          (client) =>
            !session.clients.some(
              (booking) =>
                booking.coachingId === client.coachingId && (SEAT_STATUSES.has(booking.status) || booking.status === "late_cancelled"),
            ),
        )
      : [];
  // A personal session shows the queue for its slot (PRD wave-2 §9); it goes out on its own once the slot frees.
  const waitlist = editable ? await (group ? loadSessionWaitlist(owner, session.id) : loadSlotWaitlist(owner, session.id)) : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 px-1">
        <h2 className="text-title-2">{title}</h2>
        <div>
          <Badge>{copy.status[session.status]}</Badge>
        </div>
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
          <ListRow
            icon={Link2}
            title={t.schedule.templatePage.online}
            subtitle={
              session.meetingUrl ? (
                <a href={session.meetingUrl} target="_blank" rel="noreferrer" className="break-all text-accent-ink underline">
                  {session.meetingUrl}
                </a>
              ) : (
                copy.noPlace
              )
            }
          />
        ) : (
          <ListRow
            icon={MapPin}
            title={t.schedule.templatePage.offline}
            subtitle={session.location ? [session.location.name, session.location.address].filter(Boolean).join(", ") : copy.noPlace}
          />
        )}
        {group ? (
          <ListRow
            icon={Users}
            title={interpolate(groupCopy.taken, { taken: participants.length, capacity: session.capacity })}
            subtitle={session.openForBooking ? groupCopy.selfBookingOn : groupCopy.selfBookingOff}
          />
        ) : null}
        {session.repeat ? (
          <ListRow
            icon={Repeat}
            title={copy.repeat}
            subtitle={
              session.repeat.ended
                ? copy.repeatEnded
                : interpolate(copy.repeatDays, {
                    days: session.repeat.weekdays.map((weekday) => t.schedule.sessionForm.weekdaysShort[String(weekday) as "1"]).join(", "),
                  })
            }
          />
        ) : null}
      </ListGroup>

      {group && participants.length === 0 ? (
        <ListGroup header={groupCopy.participants}>
          <ListRow title={groupCopy.noParticipants} />
        </ListGroup>
      ) : null}
      {participants.length > 0 ? (
        <ListGroup header={group ? groupCopy.participants : participants.length > 1 ? copy.clients : copy.client}>
          {participants.map((client) => (
            <ListRow
              key={client.coachingId}
              icon={User}
              title={client.name}
              subtitle={client.status === "requested" ? t.schedule.clientSessions.status.requested : undefined}
              href={client.status === "requested" ? `/trainer/requests/${client.bookingId}` : `/trainer/clients/${client.coachingId}`}
            />
          ))}
        </ListGroup>
      ) : null}

      {waitlist.length > 0 ? (
        <WaitlistQueue
          entries={waitlist.map((entry) => ({
            ...entry,
            offeredUntil: entry.offerExpiresAt ? time.format(new Date(entry.offerExpiresAt)) : null,
          }))}
          canOffer={group && participants.length + waitlist.filter((entry) => entry.status === "offered").length < session.capacity}
        />
      ) : null}

      {session.status !== "cancelled" &&
      session.mode === "offline" &&
      Date.parse(now()) >= Date.parse(session.startsAt) - 30 * 60_000 &&
      Date.parse(now()) <= Date.parse(session.endsAt) + 15 * 60_000 ? (
        <CheckInQr sessionId={session.id} timeZone={owner.timeZone} />
      ) : null}

      {session.status !== "cancelled" && session.startsAt <= now() ? (
        <AttendanceMarks
          // A check-in by QR changes a status on the server: the marks start over from the new ones.
          key={session.clients.map((client) => `${client.bookingId}:${client.status}`).join(",")}
          clients={session.clients.filter((client) => ["confirmed", "attended", "no_show"].includes(client.status))}
        />
      ) : null}

      <SessionWaivers
        openBookingId={waiveBooking}
        clients={charges.flatMap((charge) => {
          const client = session.clients.find((candidate) => candidate.bookingId === charge.bookingId);
          return client ? [{ ...charge, name: client.name, status: client.status }] : [];
        })}
      />

      <BookingHistory
        items={await loadBookingHistory(
          owner,
          session.clients.map((client) => client.bookingId),
        )}
        timeZone={owner.timeZone}
        clients={group ? new Map(session.clients.map((client) => [client.bookingId, client.name])) : undefined}
        header={group ? t.schedule.booking.history.sessionHeader : undefined}
      />

      {session.status === "cancelled" && session.cancelReason ? (
        <ListGroup header={copy.cancelReason}>
          <ListRow title={session.cancelReason} />
        </ListGroup>
      ) : null}

      {editable ? <SessionSubstitute sessionId={session.id} /> : null}

      {editable && group ? (
        <GroupControls
          sessionId={session.id}
          capacity={session.capacity}
          taken={participants.length}
          openForBooking={session.openForBooking}
          candidates={candidates}
        />
      ) : null}

      {editable && session.kind !== "trial" ? (
        <div className="flex flex-col gap-2">
          <Button asChild block>
            <Link href={`/trainer/sessions/${session.id}/edit`}>{copy.edit}</Link>
          </Button>
          <CancelSession sessionId={session.id} inRepeat={inRepeat} />
        </div>
      ) : null}
    </div>
  );
}

/** «Подмена» (PRD wave-3 §1 rule 2): hand a future session to a colleague, or see who takes it. */
async function SessionSubstitute({ sessionId }: { sessionId: string }) {
  const [t, state] = await Promise.all([getDictionary(), loadSessionDelegation(sessionId)]);
  if (!state) return null;
  const copy = t.team.substitute;
  const { delegation } = state;
  if (delegation) {
    const name = delegation.otherName ?? t.team.waitingInvite;
    return (
      <ListGroup header={copy.header} footer={copy.text}>
        <ListRow
          icon={Repeat}
          title={delegation.status === "active" ? interpolate(copy.active, { name }) : copy.pending}
          trailing={<RevokeButton delegationId={delegation.id} name={name} />}
        />
      </ListGroup>
    );
  }
  return (
    <ListGroup header={copy.header} footer={state.canDelegate ? copy.text : undefined}>
      {state.canDelegate ? (
        <div className="p-4">
          <SubstituteButton sessionId={sessionId} />
        </div>
      ) : (
        <ListRow title={copy.lockText} href="/trainer/team" />
      )}
    </ListGroup>
  );
}

/** "Занятие" (screens.md /trainer/sessions/[sessionId], PRD 2.6.2): when, where, who, and change or cancel it. */
export default async function SessionPage(props: PageProps<"/[lang]/trainer/sessions/[sessionId]">) {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.schedule.sessionPage.title} back={{ fallbackHref: "/trainer/schedule" }} />}>
      <div className="flex w-full max-w-2xl flex-col pt-4 md:pt-0">
        <Suspense fallback={<SkeletonRows rows={4} label={t.common.loading} />}>
          <SessionDetails params={props.params} searchParams={props.searchParams} />
        </Suspense>
      </div>
    </Screen>
  );
}
