import { INTL_LOCALE, type Locale } from "@/i18n/config";
import { KG_PER_LB } from "@/lib/workouts/units";

/**
 * Body measurements (PRD wave-1 §2.11-1, Q24): weight and girths on a date. Stored in kg and cm
 * (numeric(7,2)); shown in kg/cm or lb/in by the interface language, as weights in the workout log are.
 */
export const MEASUREMENT_KINDS = ["weight", "neck", "chest", "waist", "abdomen", "hips", "thigh", "upper_arm", "calf"] as const;

export type MeasurementKind = (typeof MEASUREMENT_KINDS)[number];

export const GIRTH_KINDS = MEASUREMENT_KINDS.filter((kind) => kind !== "weight");

export type UnitSystem = "metric" | "imperial";

export const CM_PER_IN = 2.54;

/** English means en-US (INTL_LOCALE), so pounds and inches; Russian is metric. */
export function unitSystem(locale: Locale): UnitSystem {
  return locale === "en" ? "imperial" : "metric";
}

export type MeasurementUnit = "kg" | "lb" | "cm" | "in";

export function unitOf(kind: MeasurementKind, system: UnitSystem): MeasurementUnit {
  if (kind === "weight") return system === "imperial" ? "lb" : "kg";
  return system === "imperial" ? "in" : "cm";
}

const factor = (unit: MeasurementUnit) => (unit === "lb" ? KG_PER_LB : unit === "in" ? CM_PER_IN : 1);

/** A typed value in the user's unit as stored: kg or cm with two decimals. */
export function toMetric(value: number, unit: MeasurementUnit): number {
  return Math.round(value * factor(unit) * 100) / 100;
}

/** A stored value in the user's unit, to one decimal. */
export function fromMetric(value: number, unit: MeasurementUnit): number {
  return Math.round((value / factor(unit)) * 10) / 10;
}

/** The largest value the column takes (numeric(7,2)) and a sane upper bound for a person. */
const MAX_METRIC: Record<MeasurementKind, number> = {
  weight: 500,
  neck: 100,
  chest: 300,
  waist: 300,
  abdomen: 300,
  hips: 300,
  thigh: 200,
  upper_arm: 150,
  calf: 150,
};

/** A stored value the server accepts: positive, two decimals at most, within what a body can measure. */
export function isValidMetric(kind: MeasurementKind, value: number): boolean {
  return Number.isFinite(value) && value > 0 && value <= MAX_METRIC[kind] && Math.abs(Math.round(value * 100) - value * 100) < 1e-6;
}

export function isMeasurementKind(value: unknown): value is MeasurementKind {
  return typeof value === "string" && (MEASUREMENT_KINDS as readonly string[]).includes(value);
}

export type ParsedValue = { ok: true; metric: number } | { ok: false; reason: "empty" | "invalid" | "range" };

/** A number typed with a comma or a dot, in the user's unit, checked against what a body can measure. */
export function parseMeasurement(kind: MeasurementKind, text: string, unit: MeasurementUnit): ParsedValue {
  const trimmed = text.trim().replace(",", ".");
  if (!trimmed) return { ok: false, reason: "empty" };
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(trimmed)) return { ok: false, reason: "invalid" };
  const metric = toMetric(Number(trimmed), unit);
  if (metric <= 0 || metric > MAX_METRIC[kind]) return { ok: false, reason: "range" };
  return { ok: true, metric };
}

export function formatValue(locale: Locale, value: number): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale], { maximumFractionDigits: 1 }).format(value);
}

/** "81,6 кг" from a stored value, with a no-break space so the unit never wraps away from the number. */
export function formatMeasurement(locale: Locale, kind: MeasurementKind, metric: number, units: Record<MeasurementUnit, string>): string {
  const unit = unitOf(kind, unitSystem(locale));
  return `${formatValue(locale, fromMetric(metric, unit))}\u00a0${units[unit]}`;
}

export type Period = "month" | "quarter" | "all";

/** The first day (YYYY-MM-DD) a chart of this period shows, counted back from `today`; null for all. */
export function periodStart(period: Period, today: string): string | null {
  if (period === "all") return null;
  const date = new Date(`${today}T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() - (period === "month" ? 1 : 3));
  return date.toISOString().slice(0, 10);
}

export type Point = { date: string; value: number };

/** One value a day for a chart: the last one entered that day wins. Input in any order, output by date. */
export function dailySeries(points: { date: string; value: number; at: string }[]): Point[] {
  const byDay = new Map<string, { value: number; at: string }>();
  for (const point of points) {
    const seen = byDay.get(point.date);
    if (!seen || seen.at <= point.at) byDay.set(point.date, { value: point.value, at: point.at });
  }
  return [...byDay.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, { value }]) => ({ date, value }));
}

/** The difference between two stored values in the user's unit, with its sign: "−1,5 кг", "+0,4 in". */
export function formatChange(locale: Locale, kind: MeasurementKind, fromMetricValue: number, toMetricValue: number, units: Record<MeasurementUnit, string>): string {
  const unit = unitOf(kind, unitSystem(locale));
  const change = Math.round((fromMetric(toMetricValue, unit) - fromMetric(fromMetricValue, unit)) * 10) / 10;
  const number = new Intl.NumberFormat(INTL_LOCALE[locale], { maximumFractionDigits: 1, signDisplay: "exceptZero" }).format(change);
  return `${number}\u00a0${units[unit]}`;
}
