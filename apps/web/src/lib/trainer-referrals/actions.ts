"use server";

import { refresh } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseDiscountPercent } from "./percent";

export type BonusFormState =
  | { status: "idle" }
  | { status: "saved" }
  | { status: "invalid"; percent: string }
  | { status: "failed"; kind: string; percent: string };

/**
 * "Сохранить" of the trainer referral bonus on /admin/invites (PRD wave-3 §3.2-12): a month of Pro or a plan
 * discount. The database checks that the caller is an admin and audits the change.
 */
export async function saveTrainerReferralBonus(_previous: BonusFormState, form: FormData): Promise<BonusFormState> {
  const kind = String(form.get("kind") ?? "") === "plan_discount" ? "plan_discount" : "plan_month";
  const percentText = String(form.get("percent") ?? "");
  const percent = kind === "plan_discount" ? parseDiscountPercent(percentText) : null;
  if (kind === "plan_discount" && percent === null) return { status: "invalid", percent: percentText };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_set_trainer_referral_bonus", {
    p_kind: kind,
    p_discount_percent: percent ?? undefined,
  });
  if (error) {
    console.error("saving the trainer referral bonus failed", error.code);
    return { status: "failed", kind, percent: percentText };
  }
  refresh();
  return { status: "saved" };
}
