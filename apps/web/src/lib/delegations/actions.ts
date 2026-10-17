"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { clientEnv } from "@/env/client";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { invitePath, isAssistantScope, isInviteToken, type AssistantScope } from "./rules";

type Reason = "invalid" | "failed" | "plan" | "taken" | "not_verified" | "own" | "expired" | "not_found";

export type DelegationActionResult<T = undefined> = ({ ok: true } & (T extends undefined ? unknown : { value: T })) | { ok: false; reason: Reason };

const isId = (value: unknown): value is string => z.uuid().safeParse(value).success;

function failed(what: string, error: { code: string; message?: string }): { ok: false; reason: Reason } {
  switch (error.message) {
    case "plan_required":
      return { ok: false, reason: "plan" };
    case "already_delegated":
      return { ok: false, reason: "taken" };
    case "not_verified":
      return { ok: false, reason: "not_verified" };
    case "own_delegation":
      return { ok: false, reason: "own" };
    case "invite_expired":
    case "not_pending":
      return { ok: false, reason: "expired" };
    case "invite_not_found":
    case "trainer_not_found":
    case "session_not_found":
    case "pair_not_found":
      return { ok: false, reason: "not_found" };
    default:
      console.error(`${what} failed`, error.code);
      return { ok: false, reason: "failed" };
  }
}

const inviteLink = (token: string) => new URL(invitePath(token), clientEnv.NEXT_PUBLIC_APP_URL).toString();

/** A new delegation's invite: the link to share, and the id to send it to a trainer found by search instead. */
export type DelegationInvite = { id: string; link: string };

/** «Передать на подмену» on a future session: returns the one-time invite. */
export async function createSubstitute(sessionId: string): Promise<DelegationActionResult<DelegationInvite>> {
  if (!isId(sessionId)) return { ok: false, reason: "invalid" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_delegation", { p_kind: "substitute", p_session_id: sessionId }).single();
  if (error) return failed("create substitute", error);
  refresh();
  return { ok: true, value: { id: data.delegation_id, link: inviteLink(data.token) } };
}

export type AssistantInput = {
  scopes: string[];
  allClients: boolean;
  coachingIds: string[];
  endsOn: string | null;
};

/** «Добавить помощника»: what the assistant may do, for which clients, until when. Returns the invite. */
export async function createAssistant(input: AssistantInput): Promise<DelegationActionResult<DelegationInvite>> {
  const scopes = Array.isArray(input.scopes) ? [...new Set(input.scopes.filter(isAssistantScope))] : [];
  const coachingIds = Array.isArray(input.coachingIds) ? [...new Set(input.coachingIds.filter(isId))] : [];
  const allClients = input.allClients === true;
  const endsOn = typeof input.endsOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.endsOn) ? input.endsOn : null;
  if (scopes.length === 0 || (!allClients && coachingIds.length === 0)) return { ok: false, reason: "invalid" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .rpc("create_delegation", {
      p_kind: "assistant",
      p_scopes: scopes as AssistantScope[],
      p_all_clients: allClients,
      p_coaching_ids: allClients ? undefined : coachingIds,
      // The end of the chosen day in UTC is late enough for any of the trainer's time zones to reach it.
      p_ends_at: endsOn ? `${endsOn}T23:59:59Z` : undefined,
    })
    .single();
  if (error) return error.code === "22023" ? { ok: false, reason: "invalid" } : failed("create assistant", error);
  refresh();
  return { ok: true, value: { id: data.delegation_id, link: inviteLink(data.token) } };
}

/** «Отозвать»: the delegate loses access at once (rule 7). */
export async function revokeDelegation(delegationId: string): Promise<DelegationActionResult> {
  if (!isId(delegationId)) return { ok: false, reason: "invalid" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("revoke_delegation", {
    p_delegation_id: delegationId,
  });
  if (error) return failed("revoke delegation", error);
  if (!data) return { ok: false, reason: "not_found" };
  refresh();
  return { ok: true };
}

export type DelegateCandidate = { trainerId: string; name: string | null; username: string | null };

/** Trainers the owner may invite, by name or @username (rule 1): verified, with an open showcase or worked with before. */
export async function searchDelegates(query: string): Promise<DelegationActionResult<DelegateCandidate[]>> {
  if (typeof query !== "string" || query.length > 64) return { ok: false, reason: "invalid" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("search_delegate_trainers", { p_query: query });
  if (error) return failed("search delegates", error);
  return { ok: true, value: data.map((row) => ({ trainerId: row.trainer_id, name: row.name, username: row.username })) };
}

/** «Пригласить»: sends the pending delegation to a trainer found by search; the earlier link stops working. */
export async function inviteDelegate(delegationId: string, trainerId: string): Promise<DelegationActionResult> {
  if (!isId(delegationId) || !isId(trainerId)) return { ok: false, reason: "invalid" };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("invite_delegate", { p_delegation_id: delegationId, p_trainer_id: trainerId });
  if (error) return failed("invite delegate", error);
  return { ok: true };
}

/** The invited trainer accepts or declines on /trainer/team/accept. */
export async function answerInvite(token: string, accept: boolean): Promise<DelegationActionResult> {
  if (!isInviteToken(token)) return { ok: false, reason: "not_found" };
  const supabase = await createSupabaseServerClient();
  const { error } = accept ? await supabase.rpc("accept_delegation", { p_token: token }) : await supabase.rpc("decline_delegation", { p_token: token });
  if (error) return failed(accept ? "accept delegation" : "decline delegation", error);
  refresh();
  return { ok: true };
}

/** The client's switch: assistants of this trainer see progress and nutrition or not (rule 6, 1.7). */
export async function setAssistantProgress(coachingId: string, allowed: boolean): Promise<DelegationActionResult> {
  if (!isId(coachingId)) return { ok: false, reason: "invalid" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("set_assistant_progress", {
    p_coaching_id: coachingId,
    p_allowed: allowed,
  });
  if (error) return failed("assistant switch", error);
  if (!data) return { ok: false, reason: "not_found" };
  refresh();
  return { ok: true };
}

/** A substitute marks a participant on its session; the owner's charging rules apply (1.2). */
export async function markDelegatedAttendance(bookingId: string, status: "attended" | "no_show"): Promise<DelegationActionResult> {
  if (!isId(bookingId) || (status !== "attended" && status !== "no_show")) return { ok: false, reason: "invalid" };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("mark_attendance", {
    p_booking_id: bookingId,
    p_status: status,
  });
  if (error) return failed("mark attendance", error);
  refresh();
  return { ok: true };
}
