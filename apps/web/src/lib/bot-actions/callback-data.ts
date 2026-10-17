/**
 * callback_data of the buttons that act right in the bot (ADR 0006, "Action buttons"). Telegram allows 64 bytes,
 * so the format is short: "<action>:<id>". The bot forwards any data with a known prefix and parses nothing; the
 * web decides what it means. apps/bot/src/fit_bot/actions.py holds the same prefixes.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Т2: confirm (bky) or decline (bkn) a booking request. Т7a: the person who came by link is the trainer's card
 * (mcy) or a new client (mcn).
 */
export type BotAction = { kind: "booking"; accept: boolean; bookingId: string } | { kind: "claim"; merge: boolean; claimId: string };

export function bookingDecisionData(bookingId: string, accept: boolean): string {
  return `${accept ? "bky" : "bkn"}:${bookingId}`;
}

export function claimAnswerData(claimId: string, merge: boolean): string {
  return `${merge ? "mcy" : "mcn"}:${claimId}`;
}

export function parseBotAction(data: string): BotAction | null {
  const [action, id, ...rest] = data.split(":");
  if (rest.length > 0 || !id || !UUID.test(id)) return null;
  if (action === "bky" || action === "bkn") return { kind: "booking", accept: action === "bky", bookingId: id };
  if (action === "mcy" || action === "mcn") return { kind: "claim", merge: action === "mcy", claimId: id };
  return null;
}
