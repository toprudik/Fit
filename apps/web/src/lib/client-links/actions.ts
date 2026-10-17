"use server";

import { refresh } from "next/cache";
import { isReferralCode } from "@/lib/referrals/link";
import { isShowcaseSlug } from "@/lib/showcase/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isTrialToken } from "@/lib/trial-links/link";
import { isClientLinkToken, normalizeClientCode } from "./link";

export type JoinFailure = "invalid" | "unavailable" | "own" | "limit" | "deleting" | "failed";

export type JoinState = { status: "idle" } | { status: "joined"; coachingId: string } | { status: "error"; reason: JoinFailure };

/** What join_by_invite and join_by_code raise, as the screen words it. */
const FAILURES: Record<string, JoinFailure> = {
  invite_invalid: "invalid",
  trainer_unavailable: "unavailable",
  own_invite: "own",
  plan_limit_reached: "limit",
  account_deleting: "deleting",
};

/**
 * "Стать клиентом" on /i/<token>, /join, the showcase /trainers/<slug>, a trial link /trial/<token> and a
 * referral link /r/<code>: joins the trainer as the signed-in user, by the link token, the typed code, the
 * showcase address, the trial link or the referral code (the database checks each and the Free limit). A pair that already exists comes back as joined too. The screen shows the toast
 * and opens the client zone.
 */
export async function joinTrainer(_previous: JoinState, formData: FormData): Promise<JoinState> {
  const token = formData.get("token");
  const trial = formData.get("trial");
  const slug = formData.get("slug");
  const referral = formData.get("referral");
  const code = normalizeClientCode(String(formData.get("code") ?? ""));
  const supabase = await createSupabaseServerClient();
  const { data, error } = isClientLinkToken(typeof token === "string" ? token : null)
    ? await supabase.rpc("join_by_invite", { p_token: token as string })
    : isTrialToken(typeof trial === "string" ? trial : null)
      ? await supabase.rpc("join_by_trial_link", { p_token: trial as string })
      : isReferralCode(typeof referral === "string" ? referral : null)
      ? await supabase.rpc("join_by_referral", { p_code: referral as string })
      : isShowcaseSlug(typeof slug === "string" ? slug : null)
      ? await supabase.rpc("join_by_showcase", { p_slug: slug as string })
      : code
        ? await supabase.rpc("join_by_code", { p_code: code })
        : { data: null, error: { message: "invite_invalid", code: "P0001" } };
  if (error || !data) {
    const reason = (error && FAILURES[error.message]) ?? "failed";
    if (reason === "failed") console.error("joining a trainer failed", error?.code);
    return { status: "error", reason };
  }
  return { status: "joined", coachingId: data };
}

export type ReissueState = { failed: boolean };

/** "Перевыпустить ссылку" on /trainer/links: the old link, code and QR stop working at once. */
export async function reissueClientLink(): Promise<ReissueState> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("reissue_client_invite");
  if (error) {
    console.error("reissuing a client link failed", error.code);
    return { failed: true };
  }
  refresh();
  return { failed: false };
}
