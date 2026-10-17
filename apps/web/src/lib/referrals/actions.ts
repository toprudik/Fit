"use server";

import { refresh } from "next/cache";
import { parseMajor } from "@/lib/money/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type OfferValues = Record<"referrer" | "referee" | "condition" | "amount" | "package" | "until", string>;

export type OfferFormState =
  | { status: "idle" }
  | { status: "saved" }
  | { status: "invalid"; fields: (keyof OfferValues)[]; values: OfferValues }
  | { status: "failed"; reason: "plan" | "failed"; values: OfferValues };

const FIELDS = ["referrer", "referee", "condition", "amount", "package", "until"] as const;

/** Whole sessions in [min, 5], or null. */
function sessions(text: string, min: number): number | null {
  if (!/^\d$/.test(text)) return null;
  const value = Number(text);
  return value >= min && value <= 5 ? value : null;
}

/**
 * "Запустить акцию" on /trainer/referrals: the bonus to both sides, the condition (none, a minimal sum in the
 * trainer's currency, or one package) and the last day. The database checks the plan and replaces the live offer.
 */
export async function saveReferralOffer(_previous: OfferFormState, form: FormData): Promise<OfferFormState> {
  const values = Object.fromEntries(FIELDS.map((name) => [name, String(form.get(name) ?? "").trim()])) as OfferValues;
  const referrer = sessions(values.referrer, 1);
  const referee = sessions(values.referee || "0", 0);
  const amount = values.condition === "amount" ? parseMajor(values.amount) : null;
  const packageId = values.condition === "package" ? values.package : null;
  const until = values.until || null;
  const fields: (keyof OfferValues)[] = [];
  if (referrer === null) fields.push("referrer");
  if (referee === null) fields.push("referee");
  if (values.condition === "amount" && !amount) fields.push("amount");
  if (values.condition === "package" && !packageId) fields.push("package");
  if (until && !/^\d{4}-\d{2}-\d{2}$/.test(until)) fields.push("until");
  if (fields.length) return { status: "invalid", fields, values };

  const supabase = await createSupabaseServerClient();
  let currency: string | null = null;
  if (amount) {
    const { data: session } = await supabase.auth.getClaims();
    const { data: trainer, error } = await supabase
      .from("trainer_profiles")
      .select("default_currency")
      .eq("user_id", session?.claims.sub ?? "")
      .maybeSingle();
    if (error || !trainer) return { status: "failed", reason: "failed", values };
    currency = trainer.default_currency;
  }
  const { error } = await supabase.rpc("save_referral_offer", {
    p_referrer_sessions: referrer as number,
    p_referee_sessions: referee as number,
    p_min_amount_minor: amount ?? undefined,
    p_currency: currency ?? undefined,
    p_package_id: packageId ?? undefined,
    p_active_to: until ?? undefined,
  });
  if (error) {
    if (error.message === "offer_invalid") return { status: "invalid", fields: ["until"], values };
    if (error.message === "plan_required") return { status: "failed", reason: "plan", values };
    console.error("saving the referral offer failed", error.code);
    return { status: "failed", reason: "failed", values };
  }
  refresh();
  return { status: "saved" };
}

/** "Остановить акцию": friends who already came still get their bonus once they pay. */
export async function stopReferralOffer(): Promise<{ failed: boolean }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("stop_referral_offer");
  if (error) {
    console.error("stopping the referral offer failed", error.code);
    return { failed: true };
  }
  refresh();
  return { failed: false };
}

/** "Отклонить" a pending referral the trainer finds suspicious (PRD wave-3 §3.1-8). */
export async function declineReferral(id: string): Promise<{ failed: boolean }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("decline_referral", { p_referral_id: id });
  if (error) {
    console.error("declining a referral failed", error.code);
    return { failed: true };
  }
  refresh();
  return { failed: false };
}
