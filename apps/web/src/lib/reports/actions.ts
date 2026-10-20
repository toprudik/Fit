"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { REPORT_CONTACT_MAX, REPORT_REASONS, REPORT_TEXT_MAX, REPORTABLE } from "./reports";

/** sent: the receipt is on its way; limit: too many today; gone: the content is no longer there to report. */
export type ReportResult = { status: "sent" | "limit" | "gone" | "invalid" | "failed" };
export type AppealResult = { status: "sent" | "already" | "gone" | "invalid" | "failed" };
export type DecisionResult = { status: "done" | "closed" | "same_admin" | "invalid" | "failed" };

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || undefined)
    .optional();

const reportInput = z.object({
  targetType: z.enum(REPORTABLE),
  targetId: z.uuid(),
  reason: z.enum(REPORT_REASONS),
  body: text(REPORT_TEXT_MAX),
});

const publicInput = z.object({
  slug: z.string().trim().min(1).max(100),
  reason: z.enum(REPORT_REASONS),
  body: text(REPORT_TEXT_MAX),
  contact: text(REPORT_CONTACT_MAX),
});

function reportError(code: string, what: string): ReportResult {
  if (code === "P0001") return { status: "limit" };
  if (code === "P0002") return { status: "gone" };
  if (code === "22023") return { status: "invalid" };
  console.error(`${what} failed`, code);
  return { status: "failed" };
}

/**
 * "Пожаловаться" on something the person was shown (DSA art. 16): a trainer's reply to their review, a comment in
 * their diary, an alias in a challenge they are in, a showcase. report_content checks they could see it and sends
 * the receipt to the bot.
 */
export async function reportContent(raw: z.input<typeof reportInput>): Promise<ReportResult> {
  const parsed = reportInput.safeParse(raw);
  if (!parsed.success) return { status: "invalid" };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("report_content", {
    p_target_type: parsed.data.targetType,
    p_target_id: parsed.data.targetId,
    p_reason: parsed.data.reason,
    p_body: parsed.data.body,
  });
  return error ? reportError(error.code, "reporting content") : { status: "sent" };
}

/** The form on a public showcase, with or without signing in; the page itself is the receipt. */
export async function reportShowcase(raw: z.input<typeof publicInput>): Promise<ReportResult> {
  const parsed = publicInput.safeParse(raw);
  if (!parsed.success) return { status: "invalid" };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("report_showcase_public", {
    p_slug: parsed.data.slug,
    p_reason: parsed.data.reason,
    p_body: parsed.data.body,
    p_contact: parsed.data.contact,
  });
  return error ? reportError(error.code, "reporting a showcase") : { status: "sent" };
}

const appealInput = z.object({ reportId: z.uuid(), body: z.string().trim().min(1).max(REPORT_TEXT_MAX) });

/** "Обжаловать" (DSA art. 20): once per decision, within six months; another admin decides. */
export async function appealReport(raw: z.input<typeof appealInput>): Promise<AppealResult> {
  const parsed = appealInput.safeParse(raw);
  if (!parsed.success) return { status: "invalid" };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("appeal_report", { p_report_id: parsed.data.reportId, p_body: parsed.data.body });
  if (error) {
    if (error.code === "23505") return { status: "already" };
    if (error.code === "P0002") return { status: "gone" };
    if (error.code === "22023") return { status: "invalid" };
    console.error("appealing a report failed", error.code);
    return { status: "failed" };
  }
  refresh();
  return { status: "sent" };
}

const decisionInput = z.object({
  reportId: z.uuid(),
  action: z.enum(["keep", "hide", "dismiss"]),
  reason: z.string().trim().min(1).max(REPORT_TEXT_MAX),
});

/**
 * An admin's decision in /admin/reports (DSA art. 17): keep or hide with a reason both sides get, or dismiss an
 * unfounded report. The admin who decided cannot decide its appeal (art. 20(6)).
 */
export async function decideReport(raw: z.input<typeof decisionInput>): Promise<DecisionResult> {
  const parsed = decisionInput.safeParse(raw);
  if (!parsed.success) return { status: "invalid" };
  const { reportId, action, reason } = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { error } =
    action === "dismiss"
      ? await supabase.rpc("admin_dismiss_report", { p_report_id: reportId, p_reason: reason })
      : await supabase.rpc("admin_decide_report", { p_report_id: reportId, p_hide: action === "hide", p_reason: reason });
  if (error) {
    if (error.code === "P0002") return { status: "closed" };
    if (error.code === "42501" && error.message === "another_admin") return { status: "same_admin" };
    if (error.code === "22023") return { status: "invalid" };
    console.error("deciding a report failed", error.code);
    return { status: "failed" };
  }
  refresh();
  return { status: "done" };
}
