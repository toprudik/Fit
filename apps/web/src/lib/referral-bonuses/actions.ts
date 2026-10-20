"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const input = z.object({ bonusId: z.uuid(), startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

export type GrantReferralBonusResult = {
  status: "done" | "not-due" | "not-pending" | "unsupported" | "invalid-start" | "failed";
};

const ERRORS: Record<string, GrantReferralBonusResult["status"]> = {
  bonus_not_due: "not-due",
  bonus_not_pending: "not-pending",
  bonus_not_found: "not-pending",
  bonus_kind_unsupported: "unsupported",
  invalid_start: "invalid-start",
};

/**
 * «Выдать месяц Pro после беты» in /admin/referral-bonuses (marketing backlog 7). admin_grant_referral_bonus checks
 * the admin and that the bonus is due, starts the month on the chosen day in the trainer's time zone, audits it
 * and queues the bot message.
 */
export async function grantReferralBonus(raw: { bonusId: string; startsOn: string }): Promise<GrantReferralBonusResult> {
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { status: parsed.error.issues.some((issue) => issue.path[0] === "startsOn") ? "invalid-start" : "failed" };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_grant_referral_bonus", { p_bonus_id: parsed.data.bonusId, p_starts_on: parsed.data.startsOn });
  if (!error) {
    refresh();
    return { status: "done" };
  }
  const status = ERRORS[error.message];
  if (status) {
    if (status === "not-pending" || status === "not-due") refresh();
    return { status };
  }
  console.error("giving a referral bonus failed", error.code);
  return { status: "failed" };
}
