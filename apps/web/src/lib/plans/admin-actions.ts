"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { zonedDayEnd } from "./plans";

const reason = z.string().trim().max(500);

const grantInput = z.object({
  userId: z.uuid(),
  plan: z.enum(["trainer_pro", "client_premium"]),
  expires: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]),
  reason,
});

export type GrantResult = {
  status: "done" | "reason-required" | "reason-short" | "already" | "not-trainer" | "invalid-expiry" | "failed";
};

/**
 * "Выдать" in /admin/plans (PLAN-2, PLAN-5). The date the admin picks is the last day the plan works: it ends
 * at the end of that day in the admin's time zone. admin_grant_plan checks the admin, writes the audit log
 * and queues the bot message and the reminder three days before the end.
 */
export async function grantPlan(raw: { userId: string; plan: string; expires: string; reason: string }): Promise<GrantResult> {
  const parsed = grantInput.safeParse(raw);
  if (!parsed.success) return { status: "failed" };
  const { userId, plan, expires } = parsed.data;
  if (!parsed.data.reason) return { status: "reason-required" };
  if (parsed.data.reason.length < 3) return { status: "reason-short" };

  const supabase = await createSupabaseServerClient();
  let expiresAt: string | undefined;
  if (expires) {
    const { data: session } = await supabase.auth.getClaims();
    const { data: settings } = session?.claims.sub
      ? await supabase.from("user_settings").select("time_zone").eq("user_id", session.claims.sub).maybeSingle()
      : { data: null };
    const end = zonedDayEnd(expires, settings?.time_zone ?? "Europe/Moscow");
    if (!end || end.getTime() <= Date.now()) return { status: "invalid-expiry" };
    expiresAt = end.toISOString();
  }

  const { error } = await supabase.rpc("admin_grant_plan", {
    p_user_id: userId,
    p_plan_code: plan,
    p_reason: parsed.data.reason,
    p_expires_at: expiresAt,
  });
  if (!error) {
    refresh();
    return { status: "done" };
  }
  switch (error.message) {
    case "already_granted":
      refresh();
      return { status: "already" };
    case "reason_required":
      return { status: "reason-required" };
    case "reason_too_short":
      return { status: "reason-short" };
    case "not_a_trainer":
      return { status: "not-trainer" };
    case "invalid_expiry":
      return { status: "invalid-expiry" };
  }
  console.error("granting a plan failed", error.code);
  return { status: "failed" };
}

export type RevokeResult = { status: "done" | "reason-required" | "reason-short" | "not-active" | "failed" };

/** "Отозвать" (PLAN-2, PLAN-5): ends an active grant with a reason; the reminder goes with it. */
export async function revokePlan(raw: { grantId: string; reason: string }): Promise<RevokeResult> {
  const parsed = z.object({ grantId: z.uuid(), reason }).safeParse(raw);
  if (!parsed.success) return { status: "failed" };
  if (!parsed.data.reason) return { status: "reason-required" };
  if (parsed.data.reason.length < 3) return { status: "reason-short" };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_revoke_plan", { p_grant_id: parsed.data.grantId, p_reason: parsed.data.reason });
  if (!error) {
    refresh();
    return { status: "done" };
  }
  if (error.message === "grant_not_active") {
    refresh();
    return { status: "not-active" };
  }
  if (error.message === "reason_required") return { status: "reason-required" };
  if (error.message === "reason_too_short") return { status: "reason-short" };
  console.error("revoking a plan failed", error.code);
  return { status: "failed" };
}

export type DeclineResult = { status: "done" | "not-open" | "failed" };

/** "Отклонить" in the request queue. A grant closes a request by itself. */
export async function declineAccessRequest(raw: { requestId: string }): Promise<DeclineResult> {
  const parsed = z.object({ requestId: z.uuid() }).safeParse(raw);
  if (!parsed.success) return { status: "failed" };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_decline_access_request", { p_request_id: parsed.data.requestId });
  if (!error) {
    refresh();
    return { status: "done" };
  }
  if (error.message === "request_not_open") {
    refresh();
    return { status: "not-open" };
  }
  console.error("declining an access request failed", error.code);
  return { status: "failed" };
}
