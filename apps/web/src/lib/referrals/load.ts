import "server-only";

import type { Json } from "@/lib/supabase/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ReferralStatus = "pending" | "qualified" | "void";

export type ReferralOffer = {
  referrerSessions: number;
  refereeSessions: number;
  minAmountMinor: number | null;
  currency: string | null;
  packageId: string | null;
  packageTitle: string | null;
  activeTo: string | null;
  live: boolean;
};

export type TrainerReferral = {
  id: string;
  status: ReferralStatus;
  voidReason: "declined" | "pair_ended" | "payment_voided" | null;
  createdAt: string;
  referrerName: string;
  referrerCoachingId: string | null;
  refereeName: string;
  refereeCoachingId: string;
  referrerSessions: number;
  refereeSessions: number;
};

function name(person: Json): string {
  if (!person || typeof person !== "object" || Array.isArray(person)) return "";
  return [person.first_name, person.last_name].filter((part) => typeof part === "string" && part.trim()).join(" ");
}

/**
 * "Приведи друга" of the signed-in trainer: whether their plan has it, the offer that is not archived, every
 * referral with both people, and their packages and currency for the form. "signed-out" without a session,
 * null without a trainer profile.
 */
export async function loadTrainerReferrals() {
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  const user = session?.claims.sub;
  if (!user) return "signed-out" as const;
  const [trainer, allowed, offer, referrals, packages] = await Promise.all([
    supabase.from("trainer_profiles").select("default_currency").eq("user_id", user).maybeSingle(),
    supabase.rpc("has_entitlement", { p_user: user, p_feature: "trainer.referral_offers" }),
    supabase.rpc("trainer_referral_offer"),
    supabase.rpc("trainer_referrals"),
    supabase.from("packages").select("id, title").eq("trainer_id", user).is("archived_at", null).order("sessions_count"),
  ]);
  const failed = [trainer, allowed, offer, referrals, packages].find((result) => result.error);
  if (failed?.error) throw new Error(`loading referrals failed: ${failed.error.code}`);
  if (!trainer.data) return null;
  const row = offer.data?.[0];
  return {
    allowed: allowed.data === true,
    currency: trainer.data.default_currency,
    packages: packages.data ?? [],
    offer: row
      ? ({
          referrerSessions: row.referrer_sessions,
          refereeSessions: row.referee_sessions,
          minAmountMinor: row.min_amount_minor,
          currency: row.currency,
          packageId: row.package_id,
          packageTitle: row.package_title,
          activeTo: row.active_to,
          live: row.live,
        } satisfies ReferralOffer)
      : null,
    referrals: (referrals.data ?? []).map(
      (r): TrainerReferral => ({
        id: r.id,
        status: r.status as ReferralStatus,
        voidReason: r.void_reason as TrainerReferral["voidReason"],
        createdAt: r.created_at,
        referrerName: name(r.referrer),
        referrerCoachingId: r.referrer_coaching_id,
        refereeName: name(r.referee),
        refereeCoachingId: r.referee_coaching_id,
        referrerSessions: r.referrer_sessions,
        refereeSessions: r.referee_sessions,
      }),
    ),
  };
}

export type ClientReferral = {
  code: string;
  referrerSessions: number;
  refereeSessions: number;
  minAmountMinor: number | null;
  currency: string | null;
  packageTitle: string | null;
  activeTo: string | null;
  friends: { firstName: string; status: ReferralStatus }[];
};

/** The client's referral link in a live pair whose trainer runs an offer, or null. */
export async function loadClientReferral(coachingId: string): Promise<ClientReferral | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("client_referral", { p_coaching_id: coachingId });
  if (error) throw new Error(`loading the referral link failed: ${error.code}`);
  const row = data?.[0];
  if (!row) return null;
  const friends = Array.isArray(row.friends) ? row.friends : [];
  return {
    code: row.code,
    referrerSessions: row.referrer_sessions,
    refereeSessions: row.referee_sessions,
    minAmountMinor: row.min_amount_minor,
    currency: row.currency,
    packageTitle: row.package_title,
    activeTo: row.active_to,
    friends: friends.flatMap((friend) =>
      friend && typeof friend === "object" && !Array.isArray(friend) && typeof friend.status === "string"
        ? [{ firstName: typeof friend.first_name === "string" ? friend.first_name : "", status: friend.status as ReferralStatus }]
        : [],
    ),
  };
}
