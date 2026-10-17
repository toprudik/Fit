import type { Locale } from "@/i18n/config";
import { interpolate } from "@/i18n/format";
import { moneyByCurrency, share } from "@/lib/admin/analytics-format";
import type { Database, Json } from "@/lib/supabase/database.types";
import { majorUnits, toCsv, type Cell } from "@/lib/trainer-analytics/csv";

type Functions = Database["public"]["Functions"];
export type OwnerSummary = Functions["admin_owner_summary"]["Returns"][number];
export type OwnerWeek = Functions["admin_owner_weekly"]["Returns"][number];
export type OwnerCohort = Functions["admin_owner_cohorts"]["Returns"][number];

/** How many weeks the statistics show (?weeks=); the database takes 4 to 52. */
export const OWNER_WEEKS = [8, 12, 26] as const;
export type OwnerWeeks = (typeof OWNER_WEEKS)[number];

/** The weeks from ?weeks=, 12 when missing or not offered. */
export function ownerWeeks(value: string | string[] | undefined): OwnerWeeks {
  const weeks = Number(typeof value === "string" ? value : undefined);
  return OWNER_WEEKS.find((option) => option === weeks) ?? 12;
}

/** Cohorts are fewer than weeks: a long tail of tiny early cohorts says nothing. */
export function cohortWeeks(weeks: OwnerWeeks): number {
  return Math.min(weeks, 12);
}

/** Whole percent change from previous to current; null when there was nothing before. */
export function growth(current: number, previous: number): number | null {
  return previous > 0 ? Math.round(((current - previous) / previous) * 100) : null;
}

/** "+12%", "−5%", "0%"; an empty string when there is nothing to compare. */
export function growthText(value: number | null): string {
  if (value === null) return "";
  if (value > 0) return `+${value}%`;
  if (value < 0) return `−${Math.abs(value)}%`;
  return "0%";
}

/** Retention of each later week as a whole percent of the cohort, null for an empty cohort. */
export function retentionShares(cohort: Pick<OwnerCohort, "size" | "retained">): (number | null)[] {
  return cohort.retained.map((count) => share(count, cohort.size));
}

/** The last fully finished week and the one before it, for "week to week": the current week is still running. */
export function lastFullWeeks(weeks: OwnerWeek[]): { current: OwnerWeek; previous: OwnerWeek } | null {
  if (weeks.length < 3) return null;
  return { current: weeks[weeks.length - 2], previous: weeks[weeks.length - 3] };
}

/** One money cell: "4000,00 RUB; 12,50 EUR", or "0" when nothing came in. */
export function moneyCell(value: Json, locale: Locale): string {
  const amounts = moneyByCurrency(value);
  if (amounts.length === 0) return "0";
  return amounts.map(({ currency, minor }) => `${majorUnits(minor, locale)} ${currency}`).join("; ");
}

export type OwnerCsvCopy = {
  sections: { summary: string; weekly: string; cohorts: string };
  metric: string;
  value: string;
  week: string;
  cohortSize: string;
  /** "Неделя {n}" */
  cohortWeek: string;
  summary: Record<keyof OwnerSummary, string>;
  weekly: Record<Exclude<keyof OwnerWeek, "week_start">, string>;
  sources: Record<string, string>;
};

const SUMMARY_ORDER: (keyof OwnerSummary)[] = [
  "users",
  "trainers",
  "trainers_verified",
  "clients",
  "cards",
  "pairs",
  "dau",
  "wau",
  "mau",
  "trainers_active_7",
  "trainers_active_30",
  "clients_active_7",
  "clients_active_30",
  "held_sessions",
  "attended",
  "bookings",
  "passes_sold",
  "turnover",
  "turnover_30",
  "trainer_invites_created",
  "trainer_invites_redeemed",
  "trainer_referrals",
  "client_referrals",
  "client_referrals_qualified",
  "joins_by_source",
];

const WEEKLY_ORDER: Exclude<keyof OwnerWeek, "week_start">[] = [
  "new_users",
  "new_trainers",
  "new_pairs",
  "active_users",
  "active_trainers",
  "active_clients",
  "held_sessions",
  "attended",
  "bookings",
  "passes_sold",
  "turnover",
  "trainer_invites_created",
  "trainer_invites_redeemed",
  "referrals",
];

function summaryValue(summary: OwnerSummary, key: keyof OwnerSummary, copy: OwnerCsvCopy, locale: Locale): Cell {
  const value = summary[key];
  if (key === "turnover" || key === "turnover_30") return moneyCell(value as Json, locale);
  if (key === "joins_by_source") {
    const sources = value && typeof value === "object" && !Array.isArray(value) ? Object.entries(value) : [];
    return sources.map(([source, count]) => `${copy.sources[source] ?? source}: ${String(count)}`).join("; ");
  }
  return value as number;
}

/**
 * The whole page as one CSV for a deck: the summary as metric/value pairs, then the weeks as columns of a
 * table, then the cohorts with retention in percent. Sections are separated by an empty line.
 */
export function ownerCsv(
  data: { summary: OwnerSummary; weekly: OwnerWeek[]; cohorts: OwnerCohort[] },
  copy: OwnerCsvCopy,
  locale: Locale,
): string {
  const longest = Math.max(0, ...data.cohorts.map((cohort) => cohort.retained.length));
  const rows: Cell[][] = [
    [copy.sections.summary],
    [copy.metric, copy.value],
    ...SUMMARY_ORDER.map((key) => [copy.summary[key], summaryValue(data.summary, key, copy, locale)]),
    [],
    [copy.sections.weekly],
    [copy.week, ...WEEKLY_ORDER.map((key) => copy.weekly[key])],
    ...data.weekly.map((week) => [
      week.week_start,
      ...WEEKLY_ORDER.map((key) => (key === "turnover" ? moneyCell(week.turnover, locale) : (week[key] as number))),
    ]),
    [],
    [copy.sections.cohorts],
    [copy.week, copy.cohortSize, ...Array.from({ length: longest }, (_, n) => interpolate(copy.cohortWeek, { n }))],
    ...data.cohorts.map((cohort) => [
      cohort.cohort_week,
      cohort.size,
      ...retentionShares(cohort).map((percent) => (percent === null ? null : `${percent}%`)),
    ]),
  ];
  const [header, ...body] = rows;
  return toCsv(header as string[], body, locale);
}

/** "dafit-stats-2026-10-17.csv" */
export function ownerCsvName(day: string): string {
  return `dafit-stats-${day}.csv`;
}
