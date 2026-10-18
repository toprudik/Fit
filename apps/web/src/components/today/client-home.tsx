import { CalendarDays, Hourglass, Ticket, Wallet } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ListGroup, ListRow } from "@/components/ui/list";
import { INTL_LOCALE, type Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { interpolate } from "@/i18n/format";
import type { ClientBooking } from "@/lib/bookings/load";
import type { ClientTrainerMoney, PassView } from "@/lib/passes/load";
import { debtText } from "@/lib/passes/debt";

export type ClientHome = {
  /** The client's zone: the session time is shown in it. */
  timeZone: string;
  /** The soonest confirmed booking that has not started yet. */
  next: ClientBooking | null;
  /** Booking requests the trainer has not answered yet. */
  requests: number;
  /** The client's trainers with a pass or a debt. */
  money: ClientTrainerMoney[];
};

/** "Осталось 8 из 10", as on the pass card (which is a Client Component, so not imported here). */
function passLeft(t: Dictionary, pass: Pick<PassView, "remaining" | "sessionsTotal">): string {
  return interpolate(t.money.passes.left, { remaining: pass.remaining, total: pass.sessionsTotal });
}

/** Passes the client can still train on: active or frozen, as on the passes screen. */
const LIVE = new Set(["active", "frozen"]);

/**
 * The client's "Главная" (screens.md §3.1): the next session, requests still waiting, and what is left on the
 * passes and owed, each opening its screen.
 */
export function ClientHomeView({ t, locale, home }: { t: Dictionary; locale: Locale; home: ClientHome }) {
  const copy = t.screens.client.home;
  const format = new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    weekday: "short",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: home.timeZone,
  });
  const trainerName = (name: string) => name || t.botMessages.unnamedTrainer;
  const passes = home.money.flatMap((group) => group.passes.filter((pass) => LIVE.has(pass.status)).map((pass) => ({ pass, group })));
  const debts = home.money.filter((group) => group.debt.sessions > 0);

  return (
    <div className="flex w-full max-w-2xl flex-col gap-6">
      {home.next || home.requests > 0 ? (
        <ListGroup header={copy.next}>
          {home.next ? (
            <ListRow
              icon={CalendarDays}
              iconTone="accent"
              title={format.format(new Date(home.next.startsAt))}
              subtitle={interpolate(t.schedule.clientSessions.trainer, { name: trainerName(home.next.trainer) })}
              href={`/client/bookings/${home.next.id}`}
            />
          ) : null}
          {home.requests > 0 ? <ListRow icon={Hourglass} title={copy.requests} value={home.requests} href="/client/sessions" /> : null}
        </ListGroup>
      ) : (
        <EmptyState
          icon={CalendarDays}
          title={copy.emptyTitle}
          description={copy.emptyText}
          action={
            <Button asChild>
              <Link href="/client/book">{copy.book}</Link>
            </Button>
          }
        />
      )}
      {passes.length || debts.length ? (
        <ListGroup header={copy.passes}>
          {debts.map((group) => (
            <ListRow
              key={`debt-${group.coachingId}`}
              icon={Wallet}
              tone="danger"
              title={copy.debt}
              subtitle={trainerName(group.trainerName)}
              value={debtText(t, locale, group.debt)}
              href="/client/passes"
            />
          ))}
          {passes.map(({ pass, group }) => (
            <ListRow
              key={pass.id}
              icon={Ticket}
              title={pass.title}
              subtitle={trainerName(group.trainerName)}
              value={passLeft(t, pass)}
              href={`/client/passes/${pass.id}`}
            />
          ))}
        </ListGroup>
      ) : null}
    </div>
  );
}
