"use server";

import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { normalizeInviteCode } from "./code";

export type RedeemState = { failed: boolean };

/** Answers of redeem_trainer_invite that the screen shows as the invite's status once it reloads. */
const STATUS_ERRORS = new Set(["already_trainer", "invite_invalid", "invite_revoked", "invite_redeemed", "invite_expired"]);

/**
 * "Стать тренером": redeems the code as the signed-in user (the database checks the invite and the
 * caller) and opens the trainer zone. When the invite changed since the screen showed it, the screen
 * reloads and says what happened to it.
 */
export async function redeemTrainerInvite(_previous: RedeemState, formData: FormData): Promise<RedeemState> {
  const code = normalizeInviteCode(String(formData.get("code") ?? ""));
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("redeem_trainer_invite", { p_code: code });
  if (error) {
    if (STATUS_ERRORS.has(error.message)) {
      refresh();
      return { failed: false };
    }
    console.error("redeeming a trainer invite failed", error.code);
    return { failed: true };
  }
  // The root layout reads whether the account is a trainer: render it again with the new profile.
  revalidatePath("/", "layout");
  redirect("/trainer");
}
