import Link from "next/link";
import type { Dictionary } from "@/i18n/dictionaries";
import { interpolate } from "@/i18n/format";
import { formatMinutes } from "@/lib/schedule/time";
import { gridHours, type DayItem, type WeekDay } from "@/lib/schedule/week";
import { cn } from "@/lib/utils";

type Copy = Dictionary["schedule"];

/** "Анна", "Группа", "Свободно": what the item is. */
function itemTitle(item: DayItem, copy: Copy): string {
  if (item.type === "free") return copy.free;
  const { session } = item;
  return session.title ?? (session.kind === "trial" ? copy.trial : session.kind === "group" ? copy.group : copy.session);
}

/** "18:30–19:30, онлайн, 5 из 8". */
function itemDetail(item: DayItem, copy: Copy): string {
  const parts = [`${formatMinutes(item.startMin)}–${formatMinutes(item.endMin)}`];
  if (item.type === "session") {
    if (item.session.mode === "online") parts.push(copy.online);
    if (item.session.kind === "group") parts.push(interpolate(copy.groupSeats, { taken: item.taken, capacity: item.session.capacity }));
  } else if (item.mode === "online") {
    parts.push(copy.online);
  }
  return parts.join(", ");
}

/** A session is a filled card, a free slot a dashed outline (docs/design.md, the schedule mockup). */
function itemClass(item: DayItem) {
  return item.type === "free"
    ? "border border-dashed border-line-strong text-ink-2"
    : item.session.kind === "trial"
      ? "bg-accent-soft text-ink"
      : "bg-surface-2 text-ink";
}

export type DayLabel = { day: string; weekday: string; date: string; long: string };

/** Phone: the day chips of the week and the chosen day as a list. */
export function DayList({
  week,
  labels,
  selected,
  today,
  copy,
}: {
  week: readonly WeekDay[];
  labels: ReadonlyMap<string, DayLabel>;
  selected: string;
  today: string;
  copy: Copy;
}) {
  const day = week.find((entry) => entry.day === selected) ?? week[0];
  const label = labels.get(day.day)!;
  return (
    <div className="flex flex-col gap-4 md:hidden">
      <nav aria-label={copy.days}>
        <ul className="grid grid-cols-7 gap-1">
          {week.map((entry) => {
            const chip = labels.get(entry.day)!;
            const active = entry.day === day.day;
            return (
              <li key={entry.day}>
                <Link
                  href={`/trainer/schedule?date=${entry.day}`}
                  aria-current={active ? "date" : undefined}
                  aria-label={chip.long}
                  className={cn(
                    "flex h-14 flex-col items-center justify-center rounded-md text-footnote tabular-nums",
                    active ? "bg-inverse text-on-inverse" : "bg-surface-1 text-ink",
                  )}
                >
                  <span className={cn(!active && "text-ink-2")}>{chip.weekday}</span>
                  <span className={cn("text-headline", !active && entry.day === today && "text-accent-ink")}>{chip.date}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <section aria-labelledby="schedule-day" className="flex flex-col gap-2">
        <h2 id="schedule-day" className="px-1 text-headline">
          {label.long}
        </h2>
        {day.closed ? <p className="rounded-md bg-surface-1 p-4 text-callout text-ink-2">{copy.closedDay}</p> : null}
        {day.items.length === 0 && !day.closed ? <p className="px-1 text-callout text-ink-2">{copy.emptyDay}</p> : null}
        <ul className="flex flex-col gap-2">
          {day.items.map((item) => (
            <li key={item.id} className={cn("flex flex-col gap-0.5 rounded-md px-4 py-3", itemClass(item))}>
              <span className="text-headline">{itemTitle(item, copy)}</span>
              <span className="text-subhead tabular-nums text-ink-2">{itemDetail(item, copy)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

const HOUR_PX = 56;

/** Desktop: the week as a time grid, as in docs/design/mockups/desktop-schedule.png. */
export function WeekGrid({
  week,
  labels,
  today,
  copy,
}: {
  week: readonly WeekDay[];
  labels: ReadonlyMap<string, DayLabel>;
  today: string;
  copy: Copy;
}) {
  const { from, to } = gridHours(week);
  const hours = Array.from({ length: to - from }, (_, index) => from + index);
  const height = (to - from) * HOUR_PX;
  const top = (minutes: number) => ((minutes - from * 60) / 60) * HOUR_PX;

  return (
    <div className="hidden overflow-hidden rounded-lg border border-line md:block">
      <div className="grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))] border-b border-line">
        <div />
        {week.map((entry) => {
          const label = labels.get(entry.day)!;
          const isToday = entry.day === today;
          return (
            <div key={entry.day} className={cn("flex flex-col items-center gap-0.5 border-l border-line py-2", isToday && "bg-surface-1")}>
              <h2 className="flex items-center gap-1.5 text-subhead">
                <span className="text-ink-2">{label.weekday}</span>
                <span
                  className={cn(
                    "grid min-w-7 place-items-center rounded-full px-1 text-headline tabular-nums",
                    isToday && "bg-accent text-on-accent",
                  )}
                >
                  {label.date}
                </span>
                <span className="sr-only">{label.long}</span>
              </h2>
              {entry.closed ? <span className="text-caption text-ink-2">{copy.closedDay}</span> : null}
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))]">
        <div className="relative" style={{ height }} aria-hidden>
          {hours.map((hour) => (
            <span key={hour} className="absolute right-2 -translate-y-1/2 text-caption tabular-nums text-ink-2" style={{ top: top(hour * 60) }}>
              {hour > from ? formatMinutes(hour * 60) : null}
            </span>
          ))}
        </div>
        {week.map((entry) => (
          <div key={entry.day} className={cn("relative border-l border-line", entry.day === today && "bg-surface-1")} style={{ height }}>
            {hours.slice(1).map((hour) => (
              <div key={hour} aria-hidden className="absolute inset-x-0 border-t border-line" style={{ top: top(hour * 60) }} />
            ))}
            <ul aria-label={labels.get(entry.day)!.long}>
              {entry.items.map((item) => (
                <li
                  key={item.id}
                  className={cn("absolute inset-x-1 flex flex-col overflow-hidden rounded-sm px-2 py-1", itemClass(item))}
                  style={{ top: top(item.startMin) + 1, height: Math.max(((item.endMin - item.startMin) / 60) * HOUR_PX - 2, 22) }}
                >
                  <span className="truncate text-footnote font-semibold">{itemTitle(item, copy)}</span>
                  <span className="truncate text-caption tabular-nums text-ink-2">{itemDetail(item, copy)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
