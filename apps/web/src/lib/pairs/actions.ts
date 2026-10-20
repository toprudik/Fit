"use server";

import { refresh } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CARD_CONTACT_MAX_LENGTH, CARD_NAME_MAX_LENGTH, END_REASON_MAX_LENGTH, isPairId, NOTE_MAX_LENGTH } from "./clients";

export type PairActionResult = { ok: true } | { ok: false; reason: "invalid" | "failed" };

function done(what: string, error: { code: string } | null, rows?: unknown[] | null): PairActionResult {
  if (error) {
    console.error(`${what} failed`, error.code);
    return { ok: false, reason: "failed" };
  }
  // RLS hides rows the caller may not change, so a refused update simply touches none.
  if (rows && rows.length === 0) return { ok: false, reason: "invalid" };
  refresh();
  return { ok: true };
}

/** A new note on the pair; hidden from the client unless `visibleToClient` (PRD wave-1 §2.5-4, Q38). */
export async function addNote(input: { coachingId: string; body: string; visibleToClient: boolean }): Promise<PairActionResult> {
  const body = input.body.trim();
  if (!isPairId(input.coachingId) || !body || body.length > NOTE_MAX_LENGTH) return { ok: false, reason: "invalid" };
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  const userId = session?.claims.sub;
  if (!userId) return { ok: false, reason: "invalid" };
  const { error } = await supabase
    .from("coaching_notes")
    .insert({ coaching_id: input.coachingId, author_id: userId, body, visible_to_client: input.visibleToClient });
  return done("adding a note", error);
}

/** Edits the text or the "Видна клиенту" mark of the caller's own note. */
export async function updateNote(input: { noteId: string; body?: string; visibleToClient?: boolean }): Promise<PairActionResult> {
  if (!isPairId(input.noteId)) return { ok: false, reason: "invalid" };
  const patch: { body?: string; visible_to_client?: boolean } = {};
  if (input.body !== undefined) {
    const body = input.body.trim();
    if (!body || body.length > NOTE_MAX_LENGTH) return { ok: false, reason: "invalid" };
    patch.body = body;
  }
  if (input.visibleToClient !== undefined) patch.visible_to_client = input.visibleToClient;
  if (!Object.keys(patch).length) return { ok: false, reason: "invalid" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("coaching_notes").update(patch).eq("id", input.noteId).select("id");
  return done("updating a note", error, data);
}

export async function deleteNote(noteId: string): Promise<PairActionResult> {
  if (!isPairId(noteId)) return { ok: false, reason: "invalid" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("coaching_notes").delete().eq("id", noteId).select("id");
  return done("deleting a note", error, data);
}

/** Moves a client to the trainer's archive or back; access and bookings stay as they are (PAIR-6). */
export async function setArchived(input: { coachingId: string; archived: boolean }): Promise<PairActionResult> {
  if (!isPairId(input.coachingId)) return { ok: false, reason: "invalid" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("coaching_trainer_meta")
    .update({ archived_at: input.archived ? new Date().toISOString() : null })
    .eq("coaching_id", input.coachingId)
    .select("coaching_id");
  return done("archiving a client", error, data);
}

/**
 * "Разрешить запись в долг" for one client (Q22); off by default. With it the client books in debt without
 * confirmation, up to `limit` unpaid sessions at a time (1 to 20; left as it is when not given).
 */
export async function setSelfBookOnDebt(input: { coachingId: string; enabled: boolean; limit?: number }): Promise<PairActionResult> {
  const limit = input.limit;
  if (!isPairId(input.coachingId) || (limit !== undefined && !(Number.isInteger(limit) && limit >= 1 && limit <= 20))) {
    return { ok: false, reason: "invalid" };
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("coachings")
    .update({ self_book_on_debt: input.enabled, ...(limit !== undefined ? { debt_limit_sessions: limit } : {}) })
    .eq("id", input.coachingId)
    .select("id");
  return done("changing debt booking", error, data);
}

/** Ends the pair from either side: future bookings are cancelled without a charge (PRIV-5). */
export async function endCoaching(input: { coachingId: string; reason?: string }): Promise<PairActionResult> {
  const reason = input.reason?.trim() ?? "";
  if (!isPairId(input.coachingId) || reason.length > END_REASON_MAX_LENGTH) return { ok: false, reason: "invalid" };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("end_coaching", { p_coaching_id: input.coachingId, p_reason: reason || undefined });
  if (error?.message === "coaching_not_found") return { ok: false, reason: "invalid" };
  return done("ending a pair", error);
}

export type CreateCardResult = { ok: true; coachingId: string } | { ok: false; reason: "invalid" | "limit" | "failed" };

/**
 * "Добавить клиента вручную" (PRD wave-1 §2.5-3): a card of a client without an account and its pair. A Free
 * trainer at the limit gets "limit" (PLAN-1).
 */
export async function createCard(input: { name: string; contact?: string; note?: string }): Promise<CreateCardResult> {
  const name = input.name.trim();
  const contact = input.contact?.trim() ?? "";
  const note = input.note?.trim() ?? "";
  if (!name || name.length > CARD_NAME_MAX_LENGTH || contact.length > CARD_CONTACT_MAX_LENGTH || note.length > NOTE_MAX_LENGTH) {
    return { ok: false, reason: "invalid" };
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_managed_client", {
    p_display_name: name,
    p_contact: contact || undefined,
    p_note: note || undefined,
  });
  if (error?.message === "plan_limit_reached") return { ok: false, reason: "limit" };
  if (error || !data) {
    if (error) console.error("creating a card failed", error.code);
    return { ok: false, reason: error?.message === "not_a_trainer" ? "invalid" : "failed" };
  }
  refresh();
  return { ok: true, coachingId: data };
}

export type ResolveClaimResult =
  | { ok: true; coachingId: string; outcome: "merged" | "new" | "closed" }
  | { ok: false; reason: "invalid" | "decided" | "failed" };

/**
 * The trainer's answer to "Это <Имя>?" (PRD wave-1 §2.5-3a): a card id merges the card into the person and
 * cannot be undone; null keeps them as a new client, which on a full Free plan closes the new pair ("closed", Q65).
 */
export async function resolveClaim(input: { claimId: string; cardId: string | null }): Promise<ResolveClaimResult> {
  if (!isPairId(input.claimId) || (input.cardId !== null && !isPairId(input.cardId))) return { ok: false, reason: "invalid" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("resolve_managed_client_claim", {
    p_claim_id: input.claimId,
    p_managed_client_id: input.cardId ?? undefined,
  });
  if (error?.message === "claim_decided" || error?.message === "claim_pair_ended") return { ok: false, reason: "decided" };
  if (error?.message === "claim_not_found" || error?.message === "card_not_found") return { ok: false, reason: "invalid" };
  if (error || !data) {
    if (error) console.error("answering a claim failed", error.code);
    return { ok: false, reason: "failed" };
  }
  let outcome: "merged" | "new" | "closed" = "merged";
  if (input.cardId === null) {
    const { data: pair } = await supabase.from("coachings").select("status").eq("id", data).maybeSingle();
    outcome = pair?.status === "ended" ? "closed" : "new";
  }
  refresh();
  return { ok: true, coachingId: data, outcome };
}
