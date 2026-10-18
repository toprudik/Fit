import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Locale } from "@/i18n/config";
import { dictionaries, type Dictionary } from "@/i18n/dictionaries";
import { interpolate } from "@/i18n/format";
import type { Database, Json } from "@/lib/supabase/database.types";
import { asTelegramUser } from "./act-as";
import { parseBotAction, type BotAction } from "./callback-data";

/**
 * What the bot shows after a tap: notice in the popup Telegram shows on the button; when resolved, the bot drops
 * the action buttons from the message and appends line, so the chat shows how the request ended.
 */
export type BotActionAnswer = { notice: string; resolved: boolean; line?: string };

type Texts = Dictionary["botActions"];

/** The language of the Telegram client, for an answer to someone without a DaFit account (AUTH-2 rule). */
function telegramLocale(languageCode: string | null): Locale {
  return languageCode?.toLowerCase().startsWith("en") ? "en" : "ru";
}

/** Handles a tap on an action button (PRD §3 Т2, Т7a, С1). Answers in the user's DaFit language. */
export async function answerBotAction(input: { telegramId: number; data: string; languageCode: string | null }): Promise<BotActionAnswer> {
  const fallback = dictionaries[telegramLocale(input.languageCode)].botActions;
  const action = parseBotAction(input.data);
  if (!action) return { notice: fallback.failed, resolved: false };

  const answer = await asTelegramUser(input.telegramId, async (supabase, userId) => {
    const { data: settings } = await supabase.from("user_settings").select("locale").eq("user_id", userId).maybeSingle();
    const t = dictionaries[settings?.locale ?? telegramLocale(input.languageCode)].botActions;
    if (action.kind === "booking") return decideBooking(supabase, t, action);
    if (action.kind === "claim") return answerClaim(supabase, t, action);
    return declineContact(supabase, t, action);
  });
  return answer ?? { notice: fallback.noAccount, resolved: false };
}

const closed = (t: Texts): BotActionAnswer => ({ notice: t.requestClosed, resolved: true, line: t.requestClosedLine });
const failed = (t: Texts, code: string): BotActionAnswer => {
  console.error("bot action failed", code);
  return { notice: t.failed, resolved: false };
};

async function decideBooking(
  supabase: SupabaseClient<Database>,
  t: Texts,
  action: Extract<BotAction, { kind: "booking" }>,
): Promise<BotActionAnswer> {
  const { error } = await supabase.rpc("decide_booking", { p_booking_id: action.bookingId, p_accept: action.accept });
  if (!error) {
    return action.accept
      ? { notice: t.bookingConfirmed, resolved: true, line: t.bookingConfirmedLine }
      : { notice: t.bookingDeclined, resolved: true, line: t.bookingDeclinedLine };
  }
  // Already answered, taken back, expired or started, or not this user's to answer: the request is closed for them.
  if (error.message === "request_not_found") return closed(t);
  return failed(t, error.code);
}

/**
 * "Это он(а)" / "Новый клиент" (PRD 2.5-3a). A merge cannot be undone, so the bot merges only when the trainer
 * has exactly one card without an account and names it in the line; with several, the choice is made in the app.
 * "Новый клиент" on a full Free plan would close the new pair (Q65), so that answer also stays in the app, where
 * the screen says so first.
 */
async function answerClaim(
  supabase: SupabaseClient<Database>,
  t: Texts,
  action: Extract<BotAction, { kind: "claim" }>,
): Promise<BotActionAnswer> {
  const { data, error } = await supabase.rpc("get_managed_client_claim", { p_claim_id: action.claimId });
  if (error?.message === "claim_not_found") return closed(t);
  if (error) return failed(t, error.code);
  const claim = (data ?? {}) as Record<string, Json | undefined>;
  if (claim.status !== "pending") return closed(t);
  const cards = (Array.isArray(claim.cards) ? claim.cards : []).map((value) => (value ?? {}) as Record<string, Json | undefined>);

  if (!action.merge) {
    if (claim.limit_full === true) return { notice: t.claimLimitFull, resolved: false };
    const resolved = await supabase.rpc("resolve_managed_client_claim", { p_claim_id: action.claimId });
    if (resolved.error) return claimError(t, resolved.error);
    return { notice: t.claimNewClient, resolved: true, line: t.claimNewClientLine };
  }

  if (cards.length === 0) return { notice: t.claimNoCards, resolved: false };
  if (cards.length > 1) return { notice: t.claimSeveralCards, resolved: false };
  const card = cards[0];
  if (typeof card.id !== "string") return failed(t, "card_without_id");
  const resolved = await supabase.rpc("resolve_managed_client_claim", { p_claim_id: action.claimId, p_managed_client_id: card.id });
  if (resolved.error) return claimError(t, resolved.error);
  const name = typeof card.name === "string" ? card.name : "";
  return { notice: t.claimMerged, resolved: true, line: interpolate(t.claimMergedLine, { name }) };
}

/** "Отказаться" on a contact request (PRIV-2): the requester learns it from С2. */
async function declineContact(
  supabase: SupabaseClient<Database>,
  t: Texts,
  action: Extract<BotAction, { kind: "contact" }>,
): Promise<BotActionAnswer> {
  const { data, error } = await supabase.rpc("decline_contact_request", { p_request_id: action.requestId });
  if (error?.message === "request_not_found") return closed(t);
  if (error || !data) return failed(t, error?.code ?? "no_status");
  if (data === "declined") return { notice: t.contactDeclined, resolved: true, line: t.contactDeclinedLine };
  if (data === "accepted") return { notice: t.contactAlreadyShared, resolved: true, line: t.contactAlreadyShared };
  return closed(t);
}

function claimError(t: Texts, error: { message: string; code: string }): BotActionAnswer {
  if (["claim_not_found", "claim_decided", "claim_pair_ended"].includes(error.message)) return closed(t);
  return failed(t, error.code);
}
