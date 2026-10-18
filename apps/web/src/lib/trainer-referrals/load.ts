import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type TrainerReferralStatus = "pending" | "qualified" | "void";

export type TrainerReferralBonus = { kind: "plan_month" } | { kind: "plan_discount"; percent: number };

export type InvitedTrainer = {
  id: string;
  firstName: string;
  createdAt: string;
  status: TrainerReferralStatus;
  /** 3+ held sessions in the last 7 days. */
  active: boolean;
  bonusPending: boolean;
};

function bonus(kind: unknown, percent: unknown): TrainerReferralBonus | null {
  if (kind === "plan_month") return { kind };
  if (kind === "plan_discount" && typeof percent === "number") return { kind, percent };
  return null;
}

function invited(item: unknown): InvitedTrainer | null {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  const row = item as Record<string, unknown>;
  const status = row.status;
  if (typeof row.id !== "string" || typeof row.created_at !== "string") return null;
  if (status !== "pending" && status !== "qualified" && status !== "void") return null;
  return {
    id: row.id,
    firstName: typeof row.first_name === "string" ? row.first_name.trim() : "",
    createdAt: row.created_at,
    status,
    active: row.active === true,
    bonusPending: row.bonus_status === "pending",
  };
}

/**
 * "Пригласить тренера" of the signed-in trainer (PRD wave-3 §3.2): their referral code (made on the first
 * visit), the bonus admins set, the trainers who came by it, and the trainer's time zone for their dates. "signed-out" without a session, null without a
 * trainer profile.
 */
export async function loadTrainerReferral() {
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  if (!session?.claims.sub) return "signed-out" as const;
  const { data: trainer, error: trainerError } = await supabase
    .from("trainer_profiles")
    .select("user_id")
    .eq("user_id", session.claims.sub)
    .maybeSingle();
  if (trainerError) throw new Error(`loading the trainer failed: ${trainerError.code}`);
  if (!trainer) return null;
  const [referral, terms, settings] = await Promise.all([
    supabase.rpc("my_trainer_referral"),
    supabase.rpc("trainer_referral_terms"),
    supabase.from("user_settings").select("time_zone").eq("user_id", session.claims.sub).maybeSingle(),
  ]);
  const failed = [referral, terms, settings].find((result) => result.error);
  if (failed?.error) throw new Error(`loading the trainer referral failed: ${failed.error.code}`);
  const row = referral.data?.[0];
  if (!row) throw new Error("loading the trainer referral returned no row");
  const items = Array.isArray(row.trainers) ? row.trainers : [];
  return {
    code: row.code,
    timeZone: settings.data?.time_zone ?? "Europe/Moscow",
    bonus: bonus(terms.data?.[0]?.bonus_kind, terms.data?.[0]?.discount_percent),
    trainers: items.map(invited).filter((item): item is InvitedTrainer => item !== null),
  };
}

/** The bonus admins set, for /admin/invites; null when the caller may not read it. */
export async function loadTrainerReferralBonus(): Promise<TrainerReferralBonus | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("trainer_referral_terms");
  if (error) throw new Error(`loading the trainer referral bonus failed: ${error.code}`);
  return bonus(data?.[0]?.bonus_kind, data?.[0]?.discount_percent);
}

export type TrainerReferrer = {
  trainerId: string;
  name: string | null;
  invited: number;
  active: number;
  bonusesPending: number;
  bonusesGranted: number;
};

/** Every trainer who invited trainers, with the numbers they see on their own screen, for /admin/invites. */
export async function loadTrainerReferrers(): Promise<TrainerReferrer[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_trainer_referrers");
  if (error) throw new Error(`loading trainer referrers failed: ${error.code}`);
  return data.map((row) => {
    const fullName = [row.first_name, row.last_name].map((part) => part?.trim()).filter(Boolean).join(" ");
    return {
      trainerId: row.trainer_id,
      name: fullName || (row.username ? `@${row.username}` : null),
      invited: row.invited,
      active: row.active,
      bonusesPending: row.bonuses_pending,
      bonusesGranted: row.bonuses_granted,
    };
  });
}
