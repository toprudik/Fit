import { addDays, parseDay, weekStart } from "@/lib/schedule/time";

/** The calendar periods of «Аналитика» (PRD wave-2 §7 rule 1), in the trainer's zone. */
export const PERIOD_KINDS = ["week", "month", "quarter", "year"] as const;
export type PeriodKind = (typeof PERIOD_KINDS)[number];

/** Local days [from, to): `to` is the first day after the period. */
export type Period = { from: string; to: string };

export function periodKind(value: unknown): PeriodKind {
  return PERIOD_KINDS.includes(value as PeriodKind) ? (value as PeriodKind) : "month";
}

/** How many periods back from the current one (0 = current); never ahead, at most five years back. */
export function periodOffset(value: unknown): number {
  const number = typeof value === "string" ? Number(value) : NaN;
  return Number.isInteger(number) && number <= 0 && number >= -60 ? number : 0;
}

/** The first day of the month `months` months after the month of `day`. */
function addMonths(day: string, months: number): string {
  const [year, month] = day.split("-").map(Number);
  const index = year * 12 + (month - 1) + months;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}-01`;
}

const MONTHS: Record<Exclude<PeriodKind, "week">, number> = { month: 1, quarter: 3, year: 12 };

/** The period of that kind holding `day`, moved by `offset` periods. */
export function periodRange(kind: PeriodKind, day: string, offset = 0): Period {
  const valid = parseDay(day);
  if (!valid) throw new Error(`not a day: ${day}`);
  if (kind === "week") {
    const from = addDays(weekStart(valid), offset * 7);
    return { from, to: addDays(from, 7) };
  }
  const [year, month] = valid.split("-").map(Number);
  const size = MONTHS[kind];
  const first = kind === "year" ? `${year}-01-01` : kind === "quarter" ? addMonths(`${year}-01-01`, Math.floor((month - 1) / 3) * 3) : `${valid.slice(0, 7)}-01`;
  const from = addMonths(first, offset * size);
  return { from, to: addMonths(from, size) };
}

/** The same kind of period just before. */
export function previousPeriod(kind: PeriodKind, period: Period): Period {
  return periodRange(kind, period.from, -1);
}

/** The three full months before the month of `day`, the base of the price simulator (§7 rule 7). */
export function simulatorBase(day: string): Period {
  const current = periodRange("month", day);
  return { from: addMonths(current.from, -3), to: current.from };
}

/** Whole-percent change against the previous period, or null when there was nothing to compare with. */
export function change(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}
