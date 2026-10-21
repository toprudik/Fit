"use server";

import { redirect } from "next/navigation";
import type { PublicScope } from "@/lib/public-data/consent";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CONSENTS_SETTINGS_PATH } from "./beta-terms";
import { HEALTH_CONSENT } from "./required";

export type RevokeState = { failed: boolean };

/**
 * "Отозвать" for the health data consent (право 5; 152-FZ art. 9 part 2). The guard trigger stamps revoked_at with
 * the time of the request; the health sections ask for the consent again. The required consents are not revoked
 * here: without them DaFit cannot keep the account, so the screen sends the user to account deletion.
 */
export async function revokeHealthConsent(): Promise<RevokeState> {
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  const userId = session?.claims.sub;
  if (!userId) return { failed: true };
  const { error } = await supabase
    .from("consents")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("kind", HEALTH_CONSENT.kind)
    .is("revoked_at", null);
  if (error) {
    console.error("revoking the health data consent failed", error.code);
    return { failed: true };
  }
  redirect(CONSENTS_SETTINGS_PATH);
}

/**
 * "Отозвать" for a consent to publish (152-FZ art. 10.1 parts 12, 13): the showcase closes at once, story cards are
 * not made any more; the cards already shared stay until they expire. Given again on the showcase or the month report.
 */
export async function revokePublicDataConsent(scope: PublicScope): Promise<RevokeState> {
  if (scope !== "showcase" && scope !== "story") return { failed: true };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("revoke_public_data_consent", { p_scope: scope });
  if (error) {
    console.error("revoking a consent to publish failed", error.code);
    return { failed: true };
  }
  redirect(CONSENTS_SETTINGS_PATH);
}
