/**
 * Fixed choices of the wizard. Specialties are stored as these keys in trainer_profiles.specialties,
 * so the showcase can show them in the viewer's language; the labels live in the dictionaries.
 */
export const SPECIALTIES = [
  "strength",
  "weight_loss",
  "functional",
  "rehab",
  "stretching",
  "yoga",
  "pilates",
  "boxing",
  "running",
  "crossfit",
  "nutrition",
  "kids",
] as const;

export type Specialty = (typeof SPECIALTIES)[number];

export function isSpecialty(value: string): value is Specialty {
  return (SPECIALTIES as readonly string[]).includes(value);
}

/** ISO 4217 codes offered for prices; RUB is the database default. */
export const CURRENCIES = ["RUB", "USD", "EUR", "KZT"] as const;

export type Currency = (typeof CURRENCIES)[number];

/** Hours before a session after which a client's cancel is charged (PRD 2.6.5); 24 is the default. */
export const CANCELLATION_HOURS = [6, 12, 24, 48] as const;

/**
 * Hours before a session a client can still book it themselves (PRD 2.6.1 rule 6, stored as
 * min_booking_notice_minutes); 2 is the default.
 */
export const BOOKING_NOTICE_HOURS = [1, 2, 4, 12, 24] as const;

/** public.payment_link_kind. */
export const PAYMENT_LINK_KINDS = ["sbp", "self_employed", "bank", "other"] as const;

export type PaymentLinkKind = (typeof PAYMENT_LINK_KINDS)[number];

/** Every IANA zone this runtime knows; the database's iana_tz check has the final word. */
export function timeZones(): string[] {
  const zones = Intl.supportedValuesOf("timeZone");
  return zones.includes("UTC") ? zones : [...zones, "UTC"];
}

/**
 * A zone this runtime lists, or a current IANA name it knows by an older alias: Node lists Europe/Kiev and
 * Asia/Calcutta, while Safari (Telegram on iOS) and Firefox report Europe/Kyiv and Asia/Kolkata.
 */
export function isTimeZone(value: string): boolean {
  if (timeZones().includes(value)) return true;
  // A fixed offset from a device with the zone set by hand (components/shell/device-time-zone.tsx).
  if (/^Etc\/GMT(-(1[0-4]|[1-9])|\+(1[0-2]|[1-9]))$/.test(value)) {
    try {
      return new Intl.DateTimeFormat("en", { timeZone: value }).resolvedOptions().timeZone === value;
    } catch {
      return false;
    }
  }
  if (!/^[A-Za-z]+(\/[A-Za-z0-9_+-]+)+$/.test(value)) return false;
  try {
    return timeZones().includes(new Intl.DateTimeFormat("en", { timeZone: value }).resolvedOptions().timeZone);
  } catch {
    return false;
  }
}
