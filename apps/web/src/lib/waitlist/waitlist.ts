import { sourceFromSearch } from "@/lib/attribution/source";

/**
 * The trainers' waitlist of /for-trainers (marketing backlog item 10): what the form sends and how a channel
 * label is read from the link. The database checks the same rules in join_trainer_waitlist.
 */

/** The consent text in force; a new wording gets a new version, so every entry says which one it agreed to. */
export const WAITLIST_CONSENT_VERSION = "2026-10-waitlist";

/** "Сколько у тебя клиентов", in the order the form shows them. */
export const CLIENT_COUNTS = ["up_to_5", "6_15", "16_40", "over_40"] as const;
export type ClientCount = (typeof CLIENT_COUNTS)[number];

export const isClientCount = (value: unknown): value is ClientCount =>
  typeof value === "string" && (CLIENT_COUNTS as readonly string[]).includes(value);

/**
 * The channel label of the visit, read the way account sign-ups read it (lib/attribution/source): ?src= first,
 * then utm_source, lowercased; anything in another shape is left out.
 */
export function waitlistSource(params: Record<string, string | string[] | undefined>): string | null {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (typeof first === "string") search.set(key, first);
  }
  return sourceFromSearch(search)?.source ?? null;
}

export const LANDING_PATH = "/for-trainers";

export const CALCULATOR_PATH = "/for-trainers/calculator";

/** The label the calculator gives its own visitors, so the waitlist tells them apart from the landing's. */
export const CALCULATOR_SOURCE = "price_calc";

/** «Вести абонементы в DaFit» on the calculator: the waitlist, with the visit's label or the calculator's own. */
export function calculatorCtaHref(source: string | null): string {
  return `${LANDING_PATH}?src=${source ?? CALCULATOR_SOURCE}#waitlist`;
}
