import { localParts } from "./time";

export type SlotRow = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: "open" | "booked" | "closed";
  mode: "offline" | "online";
  template_item_id: string | null;
};

export type SessionRow = {
  id: string;
  kind: "personal" | "group" | "trial";
  title: string | null;
  starts_at: string;
  ends_at: string;
  mode: "offline" | "online";
  capacity: number;
  status: "scheduled" | "completed" | "cancelled";
};

export type DayItem =
  | { type: "free"; id: string; startMin: number; endMin: number; mode: SlotRow["mode"] }
  | { type: "session"; id: string; startMin: number; endMin: number; session: SessionRow; taken: number };

export type WeekDay = { day: string; closed: boolean; items: DayItem[] };

/** A closed slot without a template window is a "closed days" marker (close_schedule_days), not one closed slot. */
export function isClosedMarker(slot: Pick<SlotRow, "status" | "template_item_id">): boolean {
  return slot.status === "closed" && slot.template_item_id === null;
}

/** Start and end of an instant pair on its start day, in minutes; anything past midnight ends the day. */
function span(startsAt: string, endsAt: string, timeZone: string) {
  const start = localParts(startsAt, timeZone);
  const end = localParts(endsAt, timeZone);
  return { day: start.day, startMin: start.minutes, endMin: end.day === start.day ? end.minutes : 24 * 60 };
}

/**
 * The week as the schedule shows it: free slots and live sessions per local day, earliest first, and
 * which days were closed. A booked slot is drawn by its session, a single closed slot only on the slots screen.
 */
export function buildWeek(
  days: readonly string[],
  slots: readonly SlotRow[],
  sessions: readonly SessionRow[],
  taken: ReadonlyMap<string, number>,
  timeZone: string,
): WeekDay[] {
  const week = new Map<string, WeekDay>(days.map((day) => [day, { day, closed: false, items: [] }]));

  for (const slot of slots) {
    if (isClosedMarker(slot)) {
      // A marker spans whole local days: every day it touches is closed.
      const first = localParts(slot.starts_at, timeZone).day;
      const last = localParts(new Date(Date.parse(slot.ends_at) - 1), timeZone).day;
      for (const entry of week.values()) if (entry.day >= first && entry.day <= last) entry.closed = true;
      continue;
    }
    if (slot.status !== "open") continue;
    const { day, startMin, endMin } = span(slot.starts_at, slot.ends_at, timeZone);
    week.get(day)?.items.push({ type: "free", id: slot.id, startMin, endMin, mode: slot.mode });
  }

  for (const session of sessions) {
    if (session.status === "cancelled") continue;
    const { day, startMin, endMin } = span(session.starts_at, session.ends_at, timeZone);
    week.get(day)?.items.push({ type: "session", id: session.id, startMin, endMin, session, taken: taken.get(session.id) ?? 0 });
  }

  for (const entry of week.values()) entry.items.sort((a, b) => a.startMin - b.startMin || (a.type === "session" ? -1 : 1));
  return [...week.values()];
}

/** The hours the desktop grid shows: 08:00 to 21:00 at least, wider when something falls outside. */
export function gridHours(week: readonly WeekDay[]): { from: number; to: number } {
  const items = week.flatMap((day) => day.items);
  const from = Math.min(8, ...items.map((item) => Math.floor(item.startMin / 60)));
  const to = Math.max(21, ...items.map((item) => Math.ceil(item.endMin / 60)));
  return { from, to };
}
