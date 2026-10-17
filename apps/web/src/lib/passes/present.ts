import { INTL_LOCALE, type Locale } from "@/i18n/config";
import type { Database } from "@/lib/supabase/database.types";

/** pass_balances.status: the first match of cancelled, exhausted, expired, frozen, active. */
export const PASS_STATUSES = ["active", "frozen", "expired", "exhausted", "cancelled"] as const;
export type PassStatus = (typeof PASS_STATUSES)[number];

export function passStatus(value: string | null | undefined): PassStatus {
  return PASS_STATUSES.find((status) => status === value) ?? "active";
}

export type LedgerEntryType = Database["public"]["Enums"]["ledger_entry_type"];
export type ChargeReason = Database["public"]["Enums"]["charge_reason"];
export type PaymentMethod = Database["public"]["Enums"]["payment_method"];
export type PaymentStatus = Database["public"]["Enums"]["payment_status"];
export type PaymentDirection = Database["public"]["Enums"]["payment_direction"];

/** The methods the payment forms offer (PRD 2.8-13): cash, transfer, SBP, other. */
export const PAYMENT_METHODS = ["sbp", "cash", "bank_transfer", "other"] as const satisfies readonly PaymentMethod[];

/** «Оплачен», «Частично», «Не оплачен» by the sum of confirmed payments (MONEY-9); a free pass owes nothing. */
export type PaymentState = "paid" | "partial" | "unpaid" | "free";

export function paymentState(priceMinor: number, paidMinor: number): PaymentState {
  if (priceMinor <= 0) return "free";
  if (paidMinor >= priceMinor) return "paid";
  return paidMinor > 0 ? "partial" : "unpaid";
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** The local date "YYYY-MM-DD" of an instant in a time zone. */
export function localDay(iso: string | Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

/** Today in the time zone, as "YYYY-MM-DD". */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  return localDay(now, timeZone);
}

/**
 * The last day a pass is valid, from its exclusive end instant (pass_balances.effective_expires_at: the start
 * of the day after, in the trainer time zone). Null for a pass without expiry.
 */
export function lastValidDay(exclusiveEnd: string | null, timeZone: string): string | null {
  if (!exclusiveEnd) return null;
  return localDay(new Date(new Date(exclusiveEnd).getTime() - 1), timeZone);
}

/** "YYYY-MM-DD" plus whole days, as a calendar date. */
export function addDays(day: string, days: number): string {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Days from one "YYYY-MM-DD" to another. */
export function daysBetween(from: string, to: string): number {
  const at = (day: string) => {
    const [year, month, date] = day.split("-").map(Number);
    return Date.UTC(year, month - 1, date);
  };
  return Math.round((at(to) - at(from)) / DAY_MS);
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A form date: "YYYY-MM-DD" that is a real calendar day. */
export function isDay(value: unknown): value is string {
  return typeof value === "string" && DAY.test(value) && addDays(value, 0) === value;
}

/** "30 ноября 2026" / "November 30, 2026" for a local date. */
export function formatLocalDay(locale: Locale, day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, date)),
  );
}

/** A freeze over local dates: from its first day through its last day. */
export type Freeze = { id: string; from: string; to: string; reason: string | null };

/**
 * A daterange from the database, "[2026-11-01,2026-11-11)", as first and last day. Postgres always returns a
 * discrete range in this canonical form.
 */
export function parseFreezePeriod(period: string): { from: string; to: string } | null {
  const match = /^\[(\d{4}-\d{2}-\d{2}),(\d{4}-\d{2}-\d{2})\)$/.exec(period);
  if (!match) return null;
  return { from: match[1], to: addDays(match[2], -1) };
}

/** The daterange literal for a freeze from its first day through its last day. */
export function freezePeriod(from: string, to: string): string {
  return `[${from},${addDays(to, 1)})`;
}

/** A future freeze can be removed; a current one only ended early; a past one is history (pass_freezes policies). */
export function freezeState(freeze: Pick<Freeze, "from" | "to">, today: string): "future" | "current" | "past" {
  if (freeze.from > today) return "future";
  return freeze.to >= today ? "current" : "past";
}

/** One row of a pass history: what moved the balance, by how much and when. */
export type HistoryEntry = {
  id: string;
  type: LedgerEntryType;
  reason: ChargeReason | null;
  delta: number;
  amountMinor: number;
  at: string;
  note: string | null;
  /** The charge "Простить" would forgive: an open charge, or the debt charge an unreversed settlement covers. */
  chargeId: string | null;
};

/** The UTC offset of a time zone at an instant, in minutes ("GMT+03:00" → 180). */
function offsetMinutes(timeZone: string, at: Date): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" }).formatToParts(at).find((part) => part.type === "timeZoneName")?.value;
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(name ?? "");
  if (!match) return 0;
  return (match[1] === "-" ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3]));
}

/**
 * When a payment made on a local day happened: now for today, else noon of that day in the time zone, so the
 * day stays the same wherever it is shown in that zone (income is counted by paid_at, W2).
 */
export function paidAtFor(day: string, timeZone: string, now: Date = new Date()): string {
  if (day === todayIn(timeZone, now)) return now.toISOString();
  const [year, month, date] = day.split("-").map(Number);
  const noonUtc = Date.UTC(year, month - 1, date, 12);
  return new Date(noonUtc - offsetMinutes(timeZone, new Date(noonUtc)) * 60 * 1000).toISOString();
}

/** The instant of a local day and time ("2026-10-16", "18:30") in a time zone. */
export function localInstant(day: string, time: string, timeZone: string): string {
  const [year, month, date] = day.split("-").map(Number);
  const [hours, minutes] = time.split(":").map(Number);
  const asUtc = Date.UTC(year, month - 1, date, hours, minutes);
  const first = asUtc - offsetMinutes(timeZone, new Date(asUtc)) * 60 * 1000;
  // Near a clock change the offset at the guess may differ from the offset at the result.
  return new Date(asUtc - offsetMinutes(timeZone, new Date(first)) * 60 * 1000).toISOString();
}
