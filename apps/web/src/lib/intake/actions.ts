"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { INTAKE_FORM_VERSION, intakeValues, parseIntake, type IntakeValues } from "./form";
import { clientIntakePath, clientPairPath } from "./paths";

export type SubmitIntakeState =
  | { status: "idle" }
  | { status: "sent"; flagged: boolean }
  | { status: "invalid"; fields: string[]; values: IntakeValues }
  | { status: "failed"; values: IntakeValues };

/**
 * "Отправить тренеру" (screens.md "Анкета клиента"): a new version of the client's one intake. Every trainer
 * the client shows the intake to sees it; the first version also tells them (Т8, the intakes trigger).
 */
export async function submitIntake(_previous: SubmitIntakeState, formData: FormData): Promise<SubmitIntakeState> {
  const values = intakeValues(formData);
  const parsed = parseIntake(values);
  if (!parsed.ok) return { status: "invalid", fields: parsed.fields, values };

  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  const userId = session?.claims.sub;
  if (!userId) return { status: "failed", values };
  const { error } = await supabase.from("intakes").insert({
    user_id: userId,
    form_version: INTAKE_FORM_VERSION,
    answers: parsed.answers,
    parq_answers: parsed.parq,
  });
  if (error) {
    console.error("saving the intake failed", error.code);
    return { status: "failed", values };
  }
  refresh();
  return { status: "sent", flagged: Object.values(parsed.parq).some(Boolean) };
}

/** Writes the intake flag of the client's pair and stamps the decision; false when nothing was updated. */
async function saveIntakeShare(coachingId: string, show: boolean) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("data_shares")
    .update({ intake: show, intake_decided_at: new Date().toISOString() })
    .eq("coaching_id", coachingId)
    .select("coaching_id");
  if (error) console.error("saving the intake consent failed", error.code);
  return { supabase, saved: !error && Boolean(data?.length) };
}

/**
 * The consent step (decisions Q38): "Показать" or "Не показывать" for this pair's trainer. Either answer is
 * final for the step and stamps intake_decided_at. Goes on to the intake while the client has none, otherwise
 * back to the pair.
 */
export async function decideIntakeShare(coachingId: string, show: boolean): Promise<{ failed: true }> {
  if (!z.uuid().safeParse(coachingId).success || typeof show !== "boolean") return { failed: true };
  const { supabase, saved } = await saveIntakeShare(coachingId, show);
  if (!saved) return { failed: true };
  const { data: session } = await supabase.auth.getClaims();
  const { count } = await supabase
    .from("intakes")
    .select("id", { count: "exact", head: true })
    .eq("user_id", session?.claims.sub ?? "");
  redirect(count ? clientPairPath(coachingId) : clientIntakePath(coachingId));
}

/** "Показать тренеру" / "Скрыть от тренера" on the client's intake page; "Доступ к данным" has the same switch. */
export async function setIntakeShare(coachingId: string, show: boolean): Promise<{ failed: boolean }> {
  if (!z.uuid().safeParse(coachingId).success || typeof show !== "boolean") return { failed: true };
  const { saved } = await saveIntakeShare(coachingId, show);
  if (saved) refresh();
  return { failed: !saved };
}

export type RemindIntakeResult = { status: "sent" | "already" | "filled" | "hidden" | "failed" };

/** "Напомнить" on the trainer's intake screen: one message to the client a day (remind_intake). */
export async function remindIntake(coachingId: string): Promise<RemindIntakeResult> {
  if (!z.uuid().safeParse(coachingId).success) return { status: "failed" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("remind_intake", { p_coaching_id: coachingId });
  if (error) {
    if (error.message === "intake_filled") return { status: "filled" };
    if (error.message === "intake_hidden") return { status: "hidden" };
    console.error("reminding about the intake failed", error.code);
    return { status: "failed" };
  }
  return { status: data ? "sent" : "already" };
}

/** The trainer opened the intake: what changes after this moment is marked as new next time (PRD 2.4-5). */
export async function markIntakeSeen(coachingId: string): Promise<void> {
  if (!z.uuid().safeParse(coachingId).success) return;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("coaching_trainer_meta")
    .update({ intake_seen_at: new Date().toISOString() })
    .eq("coaching_id", coachingId);
  if (error) console.error("marking the intake as seen failed", error.code);
}
