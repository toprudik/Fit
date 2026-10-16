import { addDays, localParts } from "@/lib/schedule/time";

/** Local days from `first` on, `count` of them, as YYYY-MM-DD. */
export function dayRange(first: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => addDays(first, index));
}

/** Items grouped by their local start day in the viewer's zone (PRD 2.6.7-4: a slot past midnight moves day). */
export function groupByDay<T extends { startsAt: string }>(items: readonly T[], timeZone: string): Map<string, T[]> {
  const days = new Map<string, T[]>();
  for (const item of items) {
    const { day } = localParts(item.startsAt, timeZone);
    days.set(day, [...(days.get(day) ?? []), item]);
  }
  return days;
}

/** The first of `busy` overlapping the time, for "У тебя в это время занятие у …" (PRD 2.6.4-8). */
export function findOverlap<T extends { startsAt: string; endsAt: string }>(
  time: { startsAt: string; endsAt: string },
  busy: readonly T[],
): T | null {
  const start = Date.parse(time.startsAt);
  const end = Date.parse(time.endsAt);
  return busy.find((item) => Date.parse(item.startsAt) < end && Date.parse(item.endsAt) > start) ?? null;
}

type Segmentable = { status: string; sessionStatus: string; startsAt: string };

/**
 * "Предстоящие / Прошедшие / Запросы" (screens.md /client/sessions): open requests apart, confirmed bookings of
 * sessions still ahead as upcoming (soonest first), everything else as past (newest first).
 */
export function segmentBookings<T extends Segmentable>(bookings: readonly T[], now: Date): { upcoming: T[]; past: T[]; requests: T[] } {
  const at = now.toISOString();
  const upcoming: T[] = [];
  const past: T[] = [];
  const requests: T[] = [];
  for (const booking of bookings) {
    if (booking.status === "requested" && booking.startsAt > at) requests.push(booking);
    else if (booking.status === "confirmed" && booking.sessionStatus === "scheduled" && booking.startsAt > at) upcoming.push(booking);
    else past.push(booking);
  }
  const soonest = (a: T, b: T) => a.startsAt.localeCompare(b.startsAt);
  return { upcoming: upcoming.sort(soonest), requests: requests.sort(soonest), past: past.sort((a, b) => -soonest(a, b)) };
}

/** Badge tone of a booking status: a request waits, a confirmed booking stands out, the rest are history. */
export function bookingTone(status: string): "warning" | "accent" | "neutral" {
  return status === "requested" ? "warning" : status === "confirmed" ? "accent" : "neutral";
}
