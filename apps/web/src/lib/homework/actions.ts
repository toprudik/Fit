"use server";

import { refresh } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { HOMEWORK_COMMENT_MAX_LENGTH, isHomeworkId, type HomeworkPayload } from "./homework";

export type SaveHomeworkResult =
  | { ok: true; id: string }
  | { ok: false; reason: "pair_ended" | "card_client" | "due_in_past" | "no_dates" | "failed" };

const SAVE_REASONS = ["pair_ended", "card_client", "due_in_past", "no_dates"] as const;

/** "Задать домашку" and "Сохранить" on the trainer's side: save_homework checks the pair and lays out the deadlines. */
export async function saveHomework(payload: HomeworkPayload): Promise<SaveHomeworkResult> {
  if (payload.id !== undefined ? !isHomeworkId(payload.id) : !isHomeworkId(payload.coaching_id)) {
    return { ok: false, reason: "failed" };
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("save_homework", { p_homework: payload });
  if (error || !data) {
    const reason = SAVE_REASONS.find((r) => r === error?.message);
    if (reason) return { ok: false, reason };
    console.error("saving homework failed", error?.code);
    return { ok: false, reason: "failed" };
  }
  refresh();
  return { ok: true, id: data };
}

/** "В архив": off both sides' lists; the marks stay. */
export async function archiveHomework(homeworkId: string): Promise<{ ok: boolean }> {
  if (!isHomeworkId(homeworkId)) return { ok: false };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("archive_homework", { p_homework: homeworkId });
  if (error) {
    console.error("archiving homework failed", error.code);
    return { ok: false };
  }
  refresh();
  return { ok: true };
}

export type MarkResult = { ok: true } | { ok: false; reason: "not_yet" | "too_late" | "failed" };

/** "Выполнено" by the client, with an optional comment; again on a done one changes the comment. */
export async function markHomeworkDone(input: { occurrenceId: string; comment: string }): Promise<MarkResult> {
  if (!isHomeworkId(input.occurrenceId) || typeof input.comment !== "string") return { ok: false, reason: "failed" };
  const comment = input.comment.trim();
  if (comment.length > HOMEWORK_COMMENT_MAX_LENGTH) return { ok: false, reason: "failed" };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("mark_homework_done", { p_occurrence: input.occurrenceId, p_comment: comment || undefined });
  if (error) {
    if (error.message === "not_yet") return { ok: false, reason: "not_yet" };
    console.error("marking homework done failed", error.code);
    return { ok: false, reason: "failed" };
  }
  refresh();
  return { ok: true };
}

/** "Снять отметку" within 24 hours (PRD 10-4). */
export async function unmarkHomeworkDone(occurrenceId: string): Promise<MarkResult> {
  if (!isHomeworkId(occurrenceId)) return { ok: false, reason: "failed" };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("unmark_homework_done", { p_occurrence: occurrenceId });
  if (error) {
    if (error.message === "too_late") return { ok: false, reason: "too_late" };
    console.error("unmarking homework failed", error.code);
    return { ok: false, reason: "failed" };
  }
  refresh();
  return { ok: true };
}
