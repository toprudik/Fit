import { z } from "zod";
import { INTL_LOCALE, type Locale } from "@/i18n/config";
import { MEASUREMENT_KINDS } from "@/lib/progress/measurements";
import { isShowcaseSlug } from "@/lib/showcase/link";

/**
 * Monthly report (PRD wave-3 §4): the client's finished month as public.my_monthly_report() builds it. Every
 * section is optional: the database leaves out what had no data that month.
 */
const number = z.coerce.number();

const reportSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}-01$/),
  workouts: number.default(0),
  sessions: z
    .object({
      total: number,
      trainers: z.array(z.object({ coaching_id: z.string(), name: z.string().nullable(), count: number })),
    })
    .optional(),
  records: z
    .array(
      z.object({
        exercise_id: z.string(),
        name: z.string(),
        type: z.enum(["max_weight", "max_reps", "max_duration"]),
        value: number,
        achieved_at: z.string(),
      }),
    )
    .optional(),
  measurements: z.array(z.object({ kind: z.enum(MEASUREMENT_KINDS), from: number, to: number })).optional(),
  nutrition: z.object({ logged_days: number, target_days: number, on_target_days: number }).optional(),
  steps: z.object({ average: number, days: number }).optional(),
  sleep: z.object({ average_min: number, days: number }).optional(),
  homework: z.object({ done: number, total: number }).optional(),
  /** Streaks as of the month's last day, each only while it runs: weeks of workouts, days of diary and steps. */
  streaks: z.object({ workouts: number.optional(), diary: number.optional(), steps: number.optional() }).optional(),
  /** Codes of the badges earned that month, oldest first. */
  badges: z.array(z.string()).optional(),
});

export type MonthlyReport = z.infer<typeof reportSchema>;

/** The report the database answered, or null for no report or a shape this code does not know. */
export function reportFrom(value: unknown): MonthlyReport | null {
  if (value === null || value === undefined) return null;
  const parsed = reportSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** "2026-09" in a URL to the 1st of that month, or null. */
export function monthFromParam(param: string): string | null {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(param);
  return match ? `${match[1]}-${match[2]}-01` : null;
}

/** The 1st of a month to its URL part, "2026-09". */
export function monthParam(month: string): string {
  return month.slice(0, 7);
}

/** The 1st of the month before the one `today` (YYYY-MM-DD) is in. */
export function previousMonth(today: string): string {
  const [year, month] = today.split("-").map(Number);
  return month === 1 ? `${year - 1}-12-01` : `${year}-${String(month - 1).padStart(2, "0")}-01`;
}

/** "сентябрь 2026" / "September 2026". */
export function formatMonth(locale: Locale, month: string): string {
  const [year, value] = month.split("-").map(Number);
  const text = new Intl.DateTimeFormat(INTL_LOCALE[locale], { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, value - 1, 1)),
  );
  // Russian adds "г." after the year.
  return text.replace(/\s?г\.$/, "");
}

/** Sleep minutes as "7 ч 30 мин" / "7 h 30 min" with the dictionary's units. */
export function formatSleep(minutes: number, units: { h: string; min: string }): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} ${units.min}`;
  return rest ? `${hours} ${units.h} ${rest} ${units.min}` : `${hours} ${units.h}`;
}

/** The weight change of the month in kg, or null when weight was measured fewer than two times or did not move. */
export function weightChange(report: MonthlyReport): number | null {
  const weight = report.measurements?.find((entry) => entry.kind === "weight");
  if (!weight) return null;
  const change = Math.round((weight.to - weight.from) * 10) / 10;
  return change === 0 ? null : change;
}

/** The kinds of story cards (§4-4); weight only after the client confirms it (§4-5). */
export const STORY_KINDS = ["sessions", "trainer", "records", "streak_workouts", "streak_diary", "streak_steps", "badges", "weight"] as const;
export type StoryKind = (typeof STORY_KINDS)[number];

export function isStoryKind(value: unknown): value is StoryKind {
  return (STORY_KINDS as readonly unknown[]).includes(value);
}

/** The cards this report can make: one per trainer and per running streak, plus sessions, records, badges and weight when there is data. */
export type StoryOption = { kind: StoryKind; coachingId?: string; name?: string | null };

export function storyOptions(report: MonthlyReport): StoryOption[] {
  const options: StoryOption[] = [];
  if (report.sessions?.total) options.push({ kind: "sessions" });
  for (const trainer of report.sessions?.trainers ?? []) {
    options.push({ kind: "trainer", coachingId: trainer.coaching_id, name: trainer.name });
  }
  if (report.records?.length) options.push({ kind: "records" });
  if (report.streaks?.workouts) options.push({ kind: "streak_workouts" });
  if (report.streaks?.diary) options.push({ kind: "streak_diary" });
  if (report.streaks?.steps) options.push({ kind: "streak_steps" });
  if (report.badges?.length) options.push({ kind: "badges" });
  if (weightChange(report) !== null) options.push({ kind: "weight" });
  return options;
}

const cardSchema = z.object({
  kind: z.enum(STORY_KINDS),
  month: z.string().regex(/^\d{4}-\d{2}-01$/),
  data: z.object({
    count: number.optional(),
    name: z.string().nullable().optional(),
    type: z.enum(["max_weight", "max_reps", "max_duration"]).optional(),
    value: number.optional(),
    change: number.optional(),
    /** The latest badge of the month on the badge card. */
    code: z.string().optional(),
    /** The trainer's showcase address for the QR (§4-7): only while the trainer allows it and the showcase is open. */
    slug: z.string().refine(isShowcaseSlug).optional(),
  }),
});

export type StoryCard = z.infer<typeof cardSchema>;

/** The card public.story_card() answered, or null. */
export function storyCardFrom(value: unknown): StoryCard | null {
  if (value === null || value === undefined) return null;
  const parsed = cardSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** A card id from the URL: a uuid, nothing else reaches the database. */
export function isCardId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
}

const shareTargetSchema = z.array(
  z.object({ coaching_id: z.string(), name: z.string().nullable(), shared_at: z.string().nullable() }),
);

/** A live pair the client can send the month to (§4 rule 3), and when it was sent, or null. */
export type ShareTarget = { coachingId: string; name: string | null; sharedAt: string | null };

/** The pairs public.my_monthly_report_shares() answered; nothing when the shape is unknown. */
export function shareTargetsFrom(value: unknown): ShareTarget[] {
  const parsed = shareTargetSchema.safeParse(value);
  if (!parsed.success) return [];
  return parsed.data.map((row) => ({ coachingId: row.coaching_id, name: row.name, sharedAt: row.shared_at }));
}

/** The copy a client sent to the trainer, as public.shared_monthly_report() answers it, or null. */
export function sharedReportFrom(value: unknown): { report: MonthlyReport; sharedAt: string } | null {
  const parsed = z.object({ report: z.unknown(), shared_at: z.string() }).safeParse(value);
  if (!parsed.success) return null;
  const report = reportFrom(parsed.data.report);
  return report ? { report, sharedAt: parsed.data.shared_at } : null;
}
