"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { feedbackIssueTarget, fileFeedbackIssue, type FileIssueResult } from "./github";
import { MAX_REPLY_LENGTH } from "./status";

const statusInput = z.object({ id: z.uuid(), status: z.enum(["new", "in_progress", "closed"]) });
const replyInput = z.object({ id: z.uuid(), body: z.string().trim().min(1).max(MAX_REPLY_LENGTH) });

/**
 * Moves a feedback message through new → in_progress → closed in /admin/feedback (ADM-9). A plain update as the
 * admin: RLS lets only admins change status, and the feedback_audit trigger logs it (R47).
 */
export async function setFeedbackStatus(raw: { id: string; status: string }): Promise<{ status: "done" | "failed" }> {
  const parsed = statusInput.safeParse(raw);
  if (!parsed.success) return { status: "failed" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("feedback").update({ status: parsed.data.status }).eq("id", parsed.data.id).select("id");
  if (error || !data.length) return { status: "failed" };
  refresh();
  return { status: "done" };
}

/**
 * "Создать issue" for a message whose automatic issue failed or came before the token was set. The caller must be
 * an admin (checked as the user); the issue itself is filed with the server's GitHub token.
 */
export async function fileFeedbackIssueNow(raw: { id: string }): Promise<{ status: FileIssueResult | "forbidden" }> {
  const id = z.uuid().safeParse(raw.id);
  if (!id.success) return { status: "failed" };
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  const userId = session?.claims.sub;
  if (!userId) return { status: "forbidden" };
  const { data: admin } = await supabase.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (!admin) return { status: "forbidden" };
  if (!feedbackIssueTarget()) return { status: "disabled" };
  const result = await fileFeedbackIssue(id.data);
  refresh();
  return { status: result };
}

export type ReplyResult = { status: "sent" | "author_deleted" | "invalid" | "failed" };

/**
 * "Отправить в бот" (ADM-10): admin_reply_feedback checks the admin, keeps the answer on the message, logs it and
 * queues feedback_reply for the author.
 */
export async function replyToFeedback(raw: { id: string; body: string }): Promise<ReplyResult> {
  const parsed = replyInput.safeParse(raw);
  if (!parsed.success) return { status: "invalid" };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_reply_feedback", { p_feedback_id: parsed.data.id, p_body: parsed.data.body });
  if (error) return { status: error.message === "author_deleted" ? "author_deleted" : "failed" };
  refresh();
  return { status: "sent" };
}
