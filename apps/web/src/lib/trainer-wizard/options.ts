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

/** public.payment_link_kind. */
export const PAYMENT_LINK_KINDS = ["sbp", "self_employed", "bank", "other"] as const;

export type PaymentLinkKind = (typeof PAYMENT_LINK_KINDS)[number];

/** Every IANA zone this runtime knows; the database's iana_tz check has the final word. */
export function timeZones(): string[] {
  const zones = Intl.supportedValuesOf("timeZone");
  return zones.includes("UTC") ? zones : [...zones, "UTC"];
}

export function isTimeZone(value: string): boolean {
  return timeZones().includes(value);
}
