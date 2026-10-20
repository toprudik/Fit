/**
 * Consent to make personal data public (152-FZ art. 10.1; legal/ru/consent-public-data.md, /legal/public-data). The
 * database checks every rule again (migration 20261020144917_public_data_consents.sql).
 */
export const PUBLIC_DATA_VERSION = "2026-11-beta";

export type PublicScope = "showcase" | "story";

/** Showcase fields the trainer chooses; the name always shows, without it the showcase does not work. */
export const SHOWCASE_FIELDS = ["photo", "about", "city", "locations", "prices"] as const;
export type ShowcaseField = (typeof SHOWCASE_FIELDS)[number];
/** Fields chosen with a chip; places are ticked one by one instead, and "locations" follows from them. */
export const FIELD_CHIPS = SHOWCASE_FIELDS.filter((field) => field !== "locations");

/** A place in use the trainer can tick for the showcase (its name and address go public). */
export type PublicPlace = { id: string; name: string; address: string | null };

/** Bans of art. 10.1 part 9 the person may set. */
export const PUBLIC_BANS = ["no_transfer", "no_index", "no_processing"] as const;
export type PublicBan = (typeof PUBLIC_BANS)[number];

export const CONDITION_MAX = 500;

export type PublicConsent = {
  fields: ShowcaseField[];
  bans: PublicBan[];
  condition: string | null;
  /** The places ticked; one added since is not among them and stays private. */
  locationIds: string[];
  acceptedAt: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Place ids that look like ids, once each. */
export function placeIds(values: readonly unknown[]): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && UUID.test(value)))];
}

/** Places in use the consent in force leaves private: added after it, so not published until ticked. */
export function newPlaces(places: readonly PublicPlace[], consent: PublicConsent | null): PublicPlace[] {
  if (!consent) return [];
  return places.filter((place) => !consent.locationIds.includes(place.id));
}

/** The known values among `values`, once each, in the order of `known`. */
export function pickKnown<T extends string>(values: readonly unknown[], known: readonly T[]): T[] {
  return known.filter((value) => values.includes(value));
}

/** The own condition once trimmed: null when empty, "long" over the limit. */
export function conditionText(value: string | null | undefined): string | null | "long" {
  const text = (value ?? "").trim();
  if (!text) return null;
  return text.length > CONDITION_MAX ? "long" : text;
}
