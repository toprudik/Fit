import type { Database } from "@/lib/supabase/database.types";

export type CoachingStatus = Database["public"]["Enums"]["coaching_status"];

/** The trainer's client list filters (PRD wave-1 §2.5-2). "all" is every live client not in the archive. */
export const CLIENT_FILTERS = ["all", "debt", "ending", "noPass", "archive"] as const;
export type ClientFilter = (typeof CLIENT_FILTERS)[number];

export function parseClientFilter(value: unknown): ClientFilter {
  return CLIENT_FILTERS.find((filter) => filter === value) ?? "all";
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A pair id in a URL is a uuid; anything else is a 404 without a database call. */
export function isPairId(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

/** Limits of the database checks on coaching_notes.body and coachings.end_reason. */
export const NOTE_MAX_LENGTH = 5000;
export const END_REASON_MAX_LENGTH = 500;
/** Limits of create_managed_client: the card's name and the contact the trainer keeps for themselves. */
export const CARD_NAME_MAX_LENGTH = 100;
export const CARD_CONTACT_MAX_LENGTH = 200;

/** A pass ends soon at one session left or 7 days before its end, as in the К10/Т6 messages. */
export const PASS_ENDING_SESSIONS = 1;
export const PASS_ENDING_DAYS = 7;

/** One row of the client list, built from the pair, its trainer-only meta, balances, stats and passes. */
export type ClientItem = {
  coachingId: string;
  name: string;
  photoUrl: string | null;
  /** A card of a client without an account (managed_client). */
  isCard: boolean;
  status: CoachingStatus;
  archived: boolean;
  startedAt: string;
  attended: number;
  nextSessionAt: string | null;
  availableSessions: number;
  debtSessions: number;
  hasPass: boolean;
  passEnding: boolean;
};

/** A live pair: trial or active. An ended one keeps its history and sits in the archive filter. */
export function isLive(status: CoachingStatus): boolean {
  return status !== "ended";
}

type PassRow = { available: number | null; effective_expires_at: string | null; status: string | null };

/** Whether any usable pass is about to run out: by sessions or by date. */
export function passIsEnding(passes: PassRow[], now: Date): boolean {
  const soon = now.getTime() + PASS_ENDING_DAYS * 24 * 60 * 60 * 1000;
  return passes.some(
    (pass) =>
      pass.status === "active" &&
      ((pass.available ?? 0) <= PASS_ENDING_SESSIONS ||
        (pass.effective_expires_at !== null && new Date(pass.effective_expires_at).getTime() <= soon)),
  );
}

export function matchesFilter(item: ClientItem, filter: ClientFilter): boolean {
  const listed = isLive(item.status) && !item.archived;
  switch (filter) {
    case "all":
      return listed;
    case "debt":
      return listed && item.debtSessions > 0;
    case "ending":
      return listed && item.passEnding;
    case "noPass":
      return listed && !item.hasPass;
    case "archive":
      return !listed;
  }
}

/** Lower case, ё as е, single spaces: so "Алёна" matches "алена". */
export function normalizeSearch(value: string): string {
  return value.toLocaleLowerCase("ru").replaceAll("ё", "е").replace(/\s+/g, " ").trim();
}

/** Every word of the query appears somewhere in the name. */
export function matchesSearch(name: string, query: string): boolean {
  const words = normalizeSearch(query).split(" ").filter(Boolean);
  if (!words.length) return true;
  const haystack = normalizeSearch(name);
  return words.every((word) => haystack.includes(word));
}

export function filterClients(items: ClientItem[], filter: ClientFilter, query: string): ClientItem[] {
  return items.filter((item) => matchesFilter(item, filter) && matchesSearch(item.name, query));
}

/** How a person is named on the trainer's screens: the trainer's alias, then their own name, then @username. */
export function displayName(
  person: { display_name?: string | null; first_name?: string | null; last_name?: string | null; username?: string | null } | undefined,
  alias?: string | null,
): string {
  const own = [person?.first_name, person?.last_name]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
  return alias?.trim() || person?.display_name?.trim() || own || (person?.username ? `@${person.username}` : "");
}

/**
 * The name hint on "Это тот же клиент?" (PRD wave-1 §2.5-3a): a card matches when a word of its name and a word
 * of the person's name start with the same three letters: "Катя" matches "Катерина", "Саша Петров" matches "Петров".
 */
export function cardMatchesPerson(cardName: string, person: { first_name?: string | null; last_name?: string | null; username?: string | null }): boolean {
  const words = (value: string) => normalizeSearch(value).split(" ").filter((word) => word.length >= 2);
  const card = words(cardName);
  const own = words([person.first_name, person.last_name, person.username].filter(Boolean).join(" "));
  if (!card.length || !own.length) return false;
  const prefix = (a: string, b: string) => {
    const length = Math.min(a.length, b.length, 3);
    return a.slice(0, length) === b.slice(0, length);
  };
  return card.some((word) => own.some((other) => prefix(word, other)));
}
