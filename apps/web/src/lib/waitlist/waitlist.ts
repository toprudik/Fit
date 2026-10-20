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

const LABEL = /^[A-Za-z0-9_-]{1,64}$/;

/** The channel label of the visit: ?src= first, then utm_source; anything in another shape is left out. */
export function waitlistSource(params: Record<string, string | string[] | undefined>): string | null {
  for (const key of ["src", "utm_source"]) {
    const value = params[key];
    const first = Array.isArray(value) ? value[0] : value;
    if (typeof first === "string" && LABEL.test(first)) return first;
  }
  return null;
}

export const LANDING_PATH = "/for-trainers";
