/**
 * Activity of a client's day (PRD wave-2 §4): steps, water and sleep as the diary and the trainer show them.
 * Pure rules over the rows of activity_entries; the database keeps the limits too.
 */

export type ActivityMetric = "steps" | "water" | "sleep";
export type ActivitySource = "manual" | "ios_shortcut";

export type ActivityEntry = {
  id: string;
  localDate: string;
  metric: ActivityMetric;
  value: number;
  sleepQuality: number | null;
  source: ActivitySource;
};

export type ActivityDay = {
  /** The manual value when there is one, else the iOS one (wave-2 §4.3); null when neither. */
  steps: { value: number; source: ActivitySource } | null;
  /** Millilitres; 0 without water that day. */
  waterMl: number;
  sleep: { minutes: number; quality: number | null } | null;
};

export const STEPS_MAX = 100_000;
export const WATER_ML_MAX = 5000;
/** Steps goal when the trainer set none (wave-2 §4.7). */
export const DEFAULT_STEPS_GOAL = 8000;
/** Water goal per kilogram of body weight when the trainer set none (wave-2 §4.5). */
export const WATER_ML_PER_KG = 30;
export const WATER_PORTIONS = [250, 500] as const;

/** The day as shown: steps by priority, water summed, sleep as typed. Rows of other days are ignored. */
export function activityDay(entries: ActivityEntry[], day: string): ActivityDay {
  const ofDay = entries.filter((e) => e.localDate === day);
  const steps =
    ofDay.find((e) => e.metric === "steps" && e.source === "manual") ?? ofDay.find((e) => e.metric === "steps" && e.source === "ios_shortcut");
  const sleep = ofDay.find((e) => e.metric === "sleep");
  return {
    steps: steps ? { value: steps.value, source: steps.source } : null,
    waterMl: ofDay.filter((e) => e.metric === "water").reduce((sum, e) => sum + e.value, 0),
    sleep: sleep ? { minutes: sleep.value, quality: sleep.sleepQuality } : null,
  };
}

/** The water goal: the trainer's, else 30 ml per kilogram of the latest weight, else none. */
export function waterGoalMl(targetMl: number | null, weightKg: number | null): number | null {
  if (targetMl) return targetMl;
  if (!weightKg || weightKg <= 0) return null;
  return Math.round((weightKg * WATER_ML_PER_KG) / 50) * 50;
}

/** Steps typed by hand: "9 000", "9000" → 9000; null for anything else or above the limit. */
export function parseSteps(value: string): number | null {
  const digits = value.replace(/[\s  ]/g, "");
  if (!/^\d{1,6}$/.test(digits)) return null;
  const steps = Number(digits);
  return steps <= STEPS_MAX ? steps : null;
}

/** Sleep as "7:30", "7.5" or "7,5" hours → minutes (1..1440); null for anything else. */
export function parseSleep(value: string): number | null {
  const text = value.trim();
  const clock = /^(\d{1,2}):([0-5]\d)$/.exec(text);
  const minutes = clock
    ? Number(clock[1]) * 60 + Number(clock[2])
    : /^\d{1,2}([.,]\d{1,2})?$/.test(text)
      ? Math.round(Number(text.replace(",", ".")) * 60)
      : null;
  return minutes !== null && minutes >= 1 && minutes <= 1440 ? minutes : null;
}

/** Minutes as "7:30". */
export function formatSleep(minutes: number): string {
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
}

/** Steps sent by a shortcut: a number or a numeric string (Health may give "8532.0"), rounded. */
export function shortcutSteps(value: unknown): number | null {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value.replace(",", ".").replace(/\s/g, "")) : NaN;
  return Number.isFinite(number) ? Math.round(number) : null;
}
