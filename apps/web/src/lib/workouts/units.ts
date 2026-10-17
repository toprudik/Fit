import { INTL_LOCALE, type Locale } from "@/i18n/config";

/** Weight unit (PRD 2.10-9, WORK-6, Q67): kilograms in both languages. Pounds stay convertible for a later manual choice. */
export type WeightUnit = "kg" | "lb";

export const KG_PER_LB = 0.45359237;

export function weightUnit(_locale: Locale): WeightUnit {
  return "kg";
}

/** A stored weight (kg) in the user's unit, to one decimal place in pounds and two in kilograms. */
export function fromKg(kg: number, unit: WeightUnit): number {
  return unit === "lb" ? Math.round((kg / KG_PER_LB) * 10) / 10 : Math.round(kg * 100) / 100;
}

/** A typed weight in the user's unit as stored: kilograms with two decimals (numeric(6,2)). */
export function toKg(value: number, unit: WeightUnit): number {
  return Math.round((unit === "lb" ? value * KG_PER_LB : value) * 100) / 100;
}

/** A number typed with a comma or a dot, or null when the field is empty or not a number ≥ 0. */
export function parseAmount(text: string): number | null {
  const trimmed = text.trim().replace(",", ".");
  if (!trimmed || !/^\d+(\.\d+)?$/.test(trimmed)) return null;
  return Number(trimmed);
}

export function formatAmount(locale: Locale, value: number): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale], { maximumFractionDigits: 2 }).format(value);
}

/** Seconds as "m:ss", or "h:mm:ss" from an hour. */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** "1:30", "90" (seconds) or "1:02:03" as seconds; null when empty or unreadable. */
export function parseDuration(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const parts = trimmed.split(":");
  if (parts.length > 3 || parts.some((part) => !/^\d+$/.test(part))) return null;
  const numbers = parts.map(Number);
  if (numbers.slice(1).some((n) => n > 59)) return null;
  return numbers.reduce((total, n) => total * 60 + n, 0);
}
