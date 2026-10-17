/**
 * The trainer's clock next to the client's (PRD wave-1 §2.6.7 rule 4, SCHED-19): the client sees session times in
 * their own time zone, and when the trainer's wall clock shows something else, a caption gives the trainer's time.
 */

const WALL = new Map<string, Intl.DateTimeFormat>();

/** "2026-10-17 18:00" in a time zone: two zones agree on an instant only when this matches. */
function wallClock(at: Date, timeZone: string): string {
  let format = WALL.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone,
    });
    WALL.set(timeZone, format);
  }
  return format.format(at);
}

/**
 * The session's time on the trainer's clock, "18:00–19:00" or "пт, 01:00–02:00" when the trainer's day is another,
 * or null when the trainer's clock shows the same as the client's (or the trainer's zone is unknown).
 */
export function trainerClock(
  item: { startsAt: string; endsAt: string },
  viewerZone: string,
  trainerZone: string | null | undefined,
  intl: string,
): string | null {
  if (!trainerZone || trainerZone === viewerZone) return null;
  const start = new Date(item.startsAt);
  if (wallClock(start, viewerZone) === wallClock(start, trainerZone)) return null;
  const time = new Intl.DateTimeFormat(intl, { hour: "2-digit", minute: "2-digit", timeZone: trainerZone });
  const range = `${time.format(start)}–${time.format(new Date(item.endsAt))}`;
  if (wallClock(start, viewerZone).slice(0, 10) === wallClock(start, trainerZone).slice(0, 10)) return range;
  const day = new Intl.DateTimeFormat(intl, { weekday: "short", timeZone: trainerZone });
  return `${day.format(start)}, ${range}`;
}
