"use server";

import { refresh } from "next/cache";
import { serverEnv } from "@/env/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { assertInitDataFresh, InitDataError, verifyRequestedContact } from "@/lib/telegram/init-data";
import { type ContactRequestStatus, isContactRequestId } from "./request";

/** A shared contact older than this is not trusted: the answer comes straight from the Telegram popup. */
const CONTACT_MAX_AGE_SECONDS = 10 * 60;

export type AskResult = { status: "sent" } | { status: "error"; reason: "too_soon" | "unavailable" | "failed" };

/** "Попросить связаться" on a pair's card: request_contact, then the card shows when the next one is possible. */
export async function askToContact(coachingId: string): Promise<AskResult> {
  if (!isContactRequestId(coachingId)) return { status: "error", reason: "failed" };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("request_contact", { p_coaching_id: coachingId });
  if (error) {
    if (error.message === "too_soon") return { status: "error", reason: "too_soon" };
    if (["recipient_unavailable", "has_username", "pair_ended"].includes(error.message)) return { status: "error", reason: "unavailable" };
    console.error("asking for a contact failed", error.code);
    return { status: "error", reason: "failed" };
  }
  refresh();
  return { status: "sent" };
}

export type AnswerResult = { status: ContactRequestStatus } | { status: "failed" };

/** "Отказаться" on /contact/<id>: the requester learns it (С2). */
export async function declineContact(requestId: string): Promise<AnswerResult> {
  if (!isContactRequestId(requestId)) return { status: "failed" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("decline_contact_request", { p_request_id: requestId });
  if (error || !data) {
    console.error("declining a contact request failed", error?.code);
    return { status: "failed" };
  }
  refresh();
  return { status: data };
}

/**
 * "Поделиться контактом" on /contact/<id> in the Mini App: `signedContact` is the raw answer of requestContact.
 * Only a contact Telegram signed for the signed-in user's own Telegram account, in the last few minutes, is
 * passed on; accept_contact_request runs with the secret key because it trusts the number it is given.
 */
export async function shareContact(requestId: string, signedContact: string): Promise<AnswerResult> {
  if (!isContactRequestId(requestId) || typeof signedContact !== "string" || signedContact.length > 4096) return { status: "failed" };
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  const userId = session?.claims.sub;
  if (!session || !userId) return { status: "failed" };

  let contact;
  try {
    contact = verifyRequestedContact(signedContact, { botToken: serverEnv().TELEGRAM_BOT_TOKEN });
    assertInitDataFresh(contact, { maxAgeSeconds: CONTACT_MAX_AGE_SECONDS });
  } catch (error) {
    if (!(error instanceof InitDataError)) throw error;
    console.error("a shared contact did not verify", error.message);
    return { status: "failed" };
  }
  // The session's own Telegram id (app_metadata, written only by the sign-in with the secret key).
  if (session.claims.app_metadata?.telegram_id !== contact.telegramId) {
    console.error("a shared contact belongs to another Telegram account");
    return { status: "failed" };
  }

  const { data, error } = await createSupabaseAdminClient().rpc("accept_contact_request", {
    p_request_id: requestId,
    p_user: userId,
    p_phone: contact.phone,
  });
  if (error || !data) {
    console.error("accepting a contact request failed", error?.code);
    return { status: "failed" };
  }
  refresh();
  return { status: data };
}
