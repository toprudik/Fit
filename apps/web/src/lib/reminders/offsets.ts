import type { Dictionary } from "@/i18n/dictionaries";
import { plural } from "@/i18n/format";
import type { Locale } from "@/i18n/config";

/** Presets of the reminder editor, minutes before a session (PRD 2.9-2): 1 day, 3 hours, 1 hour, 15 minutes. */
export const REMINDER_PRESETS = [1440, 180, 60, 15] as const;
/** At most three reminders, each from 5 minutes to 7 days, as private.valid_reminder_offsets checks. */
export const MAX_REMINDERS = 3;
export const MIN_OFFSET = 5;
export const MAX_OFFSET = 10080;

export type OffsetUnit = "minutes" | "hours" | "days";
export const UNIT_MINUTES: Record<OffsetUnit, number> = {
  minutes: 1,
  hours: 60,
  days: 1440,
};

/** Offsets the database accepts: whole minutes in range, no duplicates, at most three. */
export function isValidOffsets(offsets: readonly number[]): boolean {
  return (
    offsets.length <= MAX_REMINDERS &&
    new Set(offsets).size === offsets.length &&
    offsets.every((offset) => Number.isInteger(offset) && offset >= MIN_OFFSET && offset <= MAX_OFFSET)
  );
}

/** Largest first, the order the screens and the outbox use. */
export function sortOffsets(offsets: readonly number[]): number[] {
  return [...offsets].sort((a, b) => b - a);
}

/** The biggest whole unit of an offset: 1440 is "1 day", 90 is "90 minutes". */
export function splitOffset(offset: number): {
  value: number;
  unit: OffsetUnit;
} {
  if (offset % UNIT_MINUTES.days === 0) return { value: offset / UNIT_MINUTES.days, unit: "days" };
  if (offset % UNIT_MINUTES.hours === 0) return { value: offset / UNIT_MINUTES.hours, unit: "hours" };
  return { value: offset, unit: "minutes" };
}

type UnitForms = Dictionary["reminders"]["units"];

/** "1 день", "3 часа", "15 минут". */
export function formatOffset(locale: Locale, offset: number, units: UnitForms): string {
  const { value, unit } = splitOffset(offset);
  return plural(locale, value, units[unit]);
}
