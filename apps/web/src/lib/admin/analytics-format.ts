import type { Json } from "@/lib/supabase/database.types";

/** Periods the analytics offer (PRD wave-2 §8); the database refuses anything else. */
export const ANALYTICS_PERIODS = [7, 30, 90] as const;
export type AnalyticsPeriod = (typeof ANALYTICS_PERIODS)[number];

/** The period from ?days=, 30 when it is missing or not one of the offered periods. */
export function analyticsPeriod(value: string | string[] | undefined): AnalyticsPeriod {
  const days = Number(typeof value === "string" ? value : undefined);
  return ANALYTICS_PERIODS.find((period) => period === days) ?? 30;
}

/** Whole percent of part in total, or null when there is nothing to divide. */
export function share(part: number, total: number): number | null {
  return total > 0 ? Math.round((part / total) * 100) : null;
}

/** Amounts per currency from a jsonb {"RUB": 100000}, minor units; anything else is dropped. */
export function moneyByCurrency(value: Json): { currency: string; minor: number }[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value)
    .filter((entry): entry is [string, number] => typeof entry[1] === "number" && entry[1] !== 0)
    .map(([currency, minor]) => ({ currency, minor }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}
