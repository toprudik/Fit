import { INTL_LOCALE, type Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import type { Database } from "@/lib/supabase/database.types";

export type PlanCode = keyof Dictionary["plans"]["names"];
export type PlanSide = Database["public"]["Enums"]["plan_side"];
export type FeatureCode = keyof Dictionary["plans"]["features"];

/** The paid plan of each side, the one an admin grants and a locked feature asks for (PRD §2.14-1). */
export const PAID_PLAN = { trainer: "trainer_pro", client: "client_premium" } as const satisfies Record<PlanSide, PlanCode>;
export type PaidPlan = (typeof PAID_PLAN)[PlanSide];

/** The badge and lock color of a paid plan: Pro is blue, Premium gold (tokens `pro`, `premium`). */
export const PLAN_TIER = { trainer_pro: "pro", client_premium: "premium" } as const satisfies Record<PaidPlan, string>;
export type Tier = (typeof PLAN_TIER)[PaidPlan];

/**
 * What each paid plan unlocks, in the order "Мой тариф" lists it. Mirrors plans.features in the database,
 * where has_entitlement checks them; this copy is only for showing.
 */
export const PLAN_FEATURES: Record<PaidPlan, readonly FeatureCode[]> = {
  trainer_pro: [
    "trainer.unlimited_clients",
    "trainer.analytics",
    "trainer.finance",
    "trainer.groups",
    "trainer.broadcasts",
    "trainer.client_nutrition",
    "trainer.delegation",
    "trainer.referral_offers",
    "trainer.showcase_custom",
    "trainer.export",
  ],
  client_premium: ["client.trends", "client.nutrition_advanced", "client.progress_photos_unlimited", "client.self_training"],
};

/** A request this recent still shows as sent: request_access returns it instead of making a new one (PLAN-4). */
const REQUEST_DAY_MS = 24 * 60 * 60 * 1000;

/** Plans with a request that is open or was made within a day: their button already says "Запрос отправлен". */
export function requestedPlans(requests: { plan_code: string; status: string; created_at: string }[]): Set<string> {
  const since = Date.now() - REQUEST_DAY_MS;
  return new Set(
    requests.filter((request) => request.status === "open" || new Date(request.created_at).getTime() > since).map((request) => request.plan_code),
  );
}

export function isPlanCode(value: unknown): value is PlanCode {
  return value === "trainer_free" || value === "trainer_pro" || value === "client_free" || value === "client_premium";
}

export function isPaidPlan(value: unknown): value is PaidPlan {
  return value === "trainer_pro" || value === "client_premium";
}

/** Minutes the zone is ahead of UTC at that instant (negative west of Greenwich). */
function zoneOffsetMinutes(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"), part("second"));
  return Math.round((asUtc - Math.floor(instant / 1000) * 1000) / 60_000);
}

/**
 * The last second of a calendar day ("2026-11-30") in a time zone, as an instant: the end an admin means by
 * "valid through 30 November". Null for anything but a real YYYY-MM-DD date or an unknown zone.
 */
export function zonedDayEnd(day: string, timeZone: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return null;
  const [year, month, date] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const wall = Date.UTC(year, month - 1, date, 23, 59, 59);
  const check = new Date(wall);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== date) return null;
  try {
    // The offset at the guess, then again at the result, which settles a day that changes daylight saving time.
    const first = wall - zoneOffsetMinutes(wall, timeZone) * 60_000;
    return new Date(wall - zoneOffsetMinutes(first, timeZone) * 60_000);
  } catch {
    return null;
  }
}

/**
 * "30 ноября 2026" / "November 30, 2026": the last day of a plan in the reader's time zone. Russian drops the
 * trailing "г.", so a sentence can end on the date without a double full stop.
 */
export function formatPlanDate(locale: Locale, value: string | Date, timeZone: string | null | undefined): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const format = (zone: string) =>
    new Intl.DateTimeFormat(INTL_LOCALE[locale], { dateStyle: "long", timeZone: zone }).format(date).replace(/\s*г\.$/u, "");
  try {
    return format(timeZone ?? DEFAULT_TIME_ZONE);
  } catch {
    return format(DEFAULT_TIME_ZONE);
  }
}

/** The zone used when a user has none saved, as elsewhere in the app. */
export const DEFAULT_TIME_ZONE = "Europe/Moscow";
