import { CalendarDays, Inbox, Ticket, Users, Wallet } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ListGroup, ListRow } from "@/components/ui/list";
import type { Dictionary } from "@/i18n/dictionaries";
import { interpolate } from "@/i18n/format";
import { formatMinutes } from "@/lib/schedule/time";
import type { TodaySession, TrainerToday } from "@/lib/today/trainer-today";

/** Pairs with a debt and passes running out, from the money screen. */
type Attention = { debts: number; ending: number };

/** "Анна", "Группа", "Пробное": who or what the session is. */
function sessionTitle(item: TodaySession, copy: Dictionary["schedule"], names: TrainerToday["names"]): string {
  const { session } = item;
  return (
    session.title ?? names.get(session.id) ?? (session.kind === "trial" ? copy.trial : session.kind === "group" ? copy.group : copy.session)
  );
}

/** "18:30–19:30, онлайн, 5 из 8". */
function sessionDetail(item: TodaySession, copy: Dictionary["schedule"]): string {
  const parts = [`${formatMinutes(item.startMin)}–${formatMinutes(item.endMin)}`];
  if (item.session.mode === "online") parts.push(copy.online);
  if (item.session.kind === "group") parts.push(interpolate(copy.groupSeats, { taken: item.taken, capacity: item.session.capacity }));
  return parts.join(", ");
}

/**
 * The trainer's day (screens.md §2.1 "Сегодня"): today's sessions as a timeline, then what waits for an answer:
 * booking requests, debts and passes running out. A row with nothing behind it is left out.
 */
export function TrainerTodayView({ t, today, attention }: { t: Dictionary; today: TrainerToday; attention: Attention }) {
  const copy = t.screens.trainer.today;
  const rows = [
    { key: "requests", count: today.requests, icon: Inbox, title: copy.requests, href: "/trainer/requests" },
    { key: "debts", count: attention.debts, icon: Wallet, title: copy.debts, href: "/trainer/money" },
    { key: "ending", count: attention.ending, icon: Ticket, title: copy.ending, href: "/trainer/money" },
  ].filter((row) => row.count > 0);

  return (
    <div className="flex w-full max-w-2xl flex-col gap-6">
      {today.sessions.length ? (
        <ListGroup header={copy.sessions}>
          {today.sessions.map((item) => (
            <ListRow
              key={item.id}
              icon={item.session.kind === "group" ? Users : CalendarDays}
              iconTone={item.session.kind === "trial" ? "accent" : "default"}
              title={sessionTitle(item, t.schedule, today.names)}
              subtitle={<span className="tabular-nums">{sessionDetail(item, t.schedule)}</span>}
              href={`/trainer/sessions/${item.id}`}
            />
          ))}
        </ListGroup>
      ) : (
        <EmptyState
          icon={CalendarDays}
          title={copy.emptyTitle}
          description={copy.emptyText}
          action={
            <Button asChild variant="secondary">
              <Link href="/trainer/schedule">{copy.emptyAction}</Link>
            </Button>
          }
        />
      )}
      {rows.length ? (
        <ListGroup header={copy.attention}>
          {rows.map((row) => (
            <ListRow key={row.key} icon={row.icon} title={row.title} value={row.count} href={row.href} />
          ))}
        </ListGroup>
      ) : null}
    </div>
  );
}
