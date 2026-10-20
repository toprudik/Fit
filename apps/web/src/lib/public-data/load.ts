import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { pickKnown, PUBLIC_BANS, SHOWCASE_FIELDS, type PublicConsent, type PublicPlace, type PublicScope } from "./consent";

/** The signed-in person's consent in force for a scope, or null (none, or signed out). */
export async function loadMyPublicConsent(scope: PublicScope): Promise<PublicConsent | null> {
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  const me = session?.claims.sub;
  if (!me) return null;
  const { data, error } = await supabase
    .from("public_data_consents")
    .select("fields, bans, condition, location_ids, accepted_at")
    .eq("user_id", me)
    .eq("scope", scope)
    .is("revoked_at", null)
    .maybeSingle();
  if (error) throw new Error(`loading a consent to publish failed: ${error.code}`);
  if (!data) return null;
  return {
    fields: pickKnown(data.fields, SHOWCASE_FIELDS),
    bans: pickKnown(data.bans, PUBLIC_BANS),
    condition: data.condition,
    locationIds: data.location_ids,
    acceptedAt: data.accepted_at,
  };
}

/** The signed-in trainer's places in use, oldest first, as the showcase lists them. */
export async function loadMyPlaces(): Promise<PublicPlace[]> {
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  const me = session?.claims.sub;
  if (!me) return [];
  const { data, error } = await supabase
    .from("locations")
    .select("id, name, address")
    .eq("trainer_id", me)
    .is("archived_at", null)
    .order("created_at")
    .order("id");
  if (error) throw new Error(`loading places failed: ${error.code}`);
  return data;
}
