import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CONSENT_KINDS, HEALTH_CONSENT, PERSONAL_CONSENT, TERMS_CONSENTS } from "./required";

const DEFAULT_TIME_ZONE = "Europe/Moscow";

/** One consent the user gave, the edition in force: when they gave it, or null when they have not. */
export type MyConsent = { acceptedAt: string | null };

export type MyConsents = {
  /** The terms screen: beta terms, user agreement, privacy policy and 18+, given together. */
  terms: MyConsent;
  personal: MyConsent;
  health: MyConsent;
  /** After the health data consent was withdrawn: when the data goes, or went (право 5). */
  erasure: { scheduledFor: string; done: boolean } | null;
  /** Consent to publish the showcase (152-FZ art. 10.1); null for someone with no trainer profile. */
  showcase: MyConsent | null;
  /** Consent to publish story cards. */
  story: MyConsent;
  timeZone: string;
};

/** The consents screen in the settings (право 5), read as the user under RLS. Null when signed out. */
export async function loadMyConsents(): Promise<MyConsents | null> {
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  const me = session?.claims.sub;
  if (!me) return null;
  const [consents, settings, erasure, published, trainer] = await Promise.all([
    supabase.from("consents").select("kind, version, accepted_at").eq("user_id", me).in("kind", CONSENT_KINDS).is("revoked_at", null),
    supabase.from("user_settings").select("time_zone").eq("user_id", me).maybeSingle(),
    supabase.from("health_erasures").select("scheduled_for, done_at").eq("user_id", me).maybeSingle(),
    supabase.from("public_data_consents").select("scope, accepted_at").eq("user_id", me).is("revoked_at", null),
    supabase.from("trainer_profiles").select("user_id").eq("user_id", me).maybeSingle(),
  ]);
  if (consents.error) console.error("reading consents failed", consents.error.code);
  if (published.error) console.error("reading consents to publish failed", published.error.code);
  const publishedAt = (scope: "showcase" | "story") => published.data?.find((row) => row.scope === scope)?.accepted_at ?? null;
  const rows = consents.data ?? [];
  const given = (consent: { kind: string; version: string }) =>
    rows.find((row) => row.kind === consent.kind && row.version === consent.version)?.accepted_at ?? null;
  // The terms count as given once every part is: the latest of them is when the screen was accepted.
  const terms = TERMS_CONSENTS.map(given);
  const termsAt = terms.every((at) => at !== null) ? terms.reduce((latest, at) => (at! > latest! ? at : latest)) : null;
  return {
    terms: { acceptedAt: termsAt },
    personal: { acceptedAt: given(PERSONAL_CONSENT) },
    health: { acceptedAt: given(HEALTH_CONSENT) },
    erasure: erasure.data
      ? { scheduledFor: erasure.data.done_at ?? erasure.data.scheduled_for, done: erasure.data.done_at !== null }
      : null,
    showcase: trainer.data ? { acceptedAt: publishedAt("showcase") } : null,
    story: { acceptedAt: publishedAt("story") },
    timeZone: settings.data?.time_zone ?? DEFAULT_TIME_ZONE,
  };
}
