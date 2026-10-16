"use server";

import { refresh } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { END_REASON_MAX_LENGTH, isPairId, NOTE_MAX_LENGTH } from "./clients";

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

/** "Разрешить запись в долг" for one client (Q22); off by default. */
export async function setSelfBookOnDebt(input: { coachingId: string; enabled: boolean }): Promise<PairActionResult> {
  if (!isPairId(input.coachingId)) return { ok: false, reason: "invalid" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("coachings")
    .update({ self_book_on_debt: input.enabled })
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
