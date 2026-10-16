"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  BETA_TERMS_VERSION,
  CONSENT_COOKIE,
  CONSENT_PATH,
  consentCookieOptions,
  consentCookieValue,
  PREFERENCES_PATH,
} from "./beta-terms";
import { onboardingNext, withNext } from "./next";

export type AcceptState = { failed: boolean };

/**
 * "Принимаю" (PRD wave-1 §2.1 rule 3, AUTH-4): records the version in force for the signed-in user (RLS lets
 * a user insert their own row only) and goes on. After the very first acceptance comes the language, theme
 * and bot messages step; after a new version (AUTH-5) the user goes straight back to `next`.
 */
export async function acceptBetaTerms(_previous: AcceptState, formData: FormData): Promise<AcceptState> {
  const next = onboardingNext(formData.get("next"));
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  const userId = session?.claims.sub;
  if (!userId) redirect(withNext("/login", withNext(CONSENT_PATH, next)));

  const { data: earlier, error: readError } = await supabase
    .from("consents")
    .select("id")
    .eq("user_id", userId)
    .eq("kind", "beta_terms")
    .limit(1);
  if (readError) {
    console.error("reading earlier beta terms consents failed", readError.code);
    return { failed: true };
  }
  const { error } = await supabase.from("consents").insert({ user_id: userId, kind: "beta_terms", version: BETA_TERMS_VERSION });
  // 23505: this version is accepted already (a second tap, another tab). That is the state we want.
  if (error && error.code !== "23505") {
    console.error("saving the beta terms consent failed", error.code);
    return { failed: true };
  }

  (await cookies()).set(CONSENT_COOKIE, consentCookieValue(userId), consentCookieOptions);
  redirect(earlier.length === 0 ? withNext(PREFERENCES_PATH, next) : next);
}
