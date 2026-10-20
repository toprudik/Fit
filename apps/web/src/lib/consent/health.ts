import "server-only";
import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CONSENT_PATH } from "./beta-terms";
import { HEALTH_CONSENT, hasHealthConsent } from "./required";

/**
 * Whether the signed-in user's health data consent in force is given (право 3), read as the user under RLS, once
 * per request. A failed read counts as not given: the section then asks, and the consent screen goes straight on
 * when the consent is there after all. Signed out there is nothing to guard (the proxy sends to sign-in, and the
 * screens show their signed-out state), so it lets the screen through.
 */
export const mayOpenHealthSections = cache(async (): Promise<boolean> => {
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  const me = session?.claims.sub;
  if (!me) return true;
  const { data, error } = await supabase
    .from("consents")
    .select("kind, version")
    .eq("user_id", me)
    .eq("kind", HEALTH_CONSENT.kind)
    .is("revoked_at", null);
  if (error) console.error("reading the health data consent failed", error.code);
  return hasHealthConsent(data ?? []);
});

/** The health data step of the consent screen, back to `next` after it. */
export function healthConsentPath(next: string): string {
  return `${CONSENT_PATH}?${new URLSearchParams({ step: "health", next })}`;
}
