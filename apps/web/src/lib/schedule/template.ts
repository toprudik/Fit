/** Session lengths the template offers, in minutes (the database allows 15 to 480). */
export const DURATIONS = [30, 45, 60, 75, 90, 120] as const;
/** How far ahead slots open, in weeks (PRD 2.6.1-2 by default 4; the database allows 1 to 12). */
export const HORIZON_WEEKS = [1, 2, 3, 4, 6, 8, 12] as const;
/** Breaks between generated slots, in minutes. */
export const BUFFERS = [0, 10, 15, 30] as const;

export type TemplateWindow = {
  isoWeekday: number;
  /** "09:00" */
  start: string;
  end: string;
  durationMin: number;
  mode: "offline" | "online";
  locationId: string | null;
  meetingUrl: string | null;
};

function minutes(value: string): number {
  const [hours, mins] = value.split(":").map(Number);
  return hours * 60 + mins;
}

/** How many slots a window gives with the break between them, as the generator cuts it. */
export function slotsInWindow(window: Pick<TemplateWindow, "start" | "end" | "durationMin">, bufferMin: number): number {
  const length = minutes(window.end) - minutes(window.start);
  if (length < window.durationMin) return 0;
  return Math.floor((length - window.durationMin) / (window.durationMin + bufferMin)) + 1;
}

/** Whether a new window overlaps one already on that day. */
export function overlapsAny(window: TemplateWindow, windows: readonly TemplateWindow[]): boolean {
  return windows.some(
    (other) =>
      other !== window &&
      other.isoWeekday === window.isoWeekday &&
      minutes(other.start) < minutes(window.end) &&
      minutes(window.start) < minutes(other.end),
  );
}

/** Windows by day, Monday first, earliest first within a day. */
export function sortWindows(windows: readonly TemplateWindow[]): TemplateWindow[] {
  return [...windows].sort((a, b) => a.isoWeekday - b.isoWeekday || minutes(a.start) - minutes(b.start));
}
