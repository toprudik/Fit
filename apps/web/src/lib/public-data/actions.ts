"use server";

import { refresh } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { conditionText, pickKnown, placeIds, PUBLIC_BANS, PUBLIC_DATA_VERSION, SHOWCASE_FIELDS, type PublicScope } from "./consent";

export type ConsentResult = { status: "done" | "invalid" | "failed" };

const isScope = (value: unknown): value is PublicScope => value === "showcase" || value === "story";

/**
 * "Даю согласие": a new consent replaces the one in force; for the showcase it also switches the showcase on.
 * Story cards take no fields, the person picks what goes on each card. Showcase places go by id: the database checks
 * they are the trainer's own, and "locations" follows from them.
 */
export async function givePublicConsent(input: {
  scope: PublicScope;
  fields?: readonly string[];
  bans?: readonly string[];
  condition?: string | null;
  locationIds?: readonly string[];
}): Promise<ConsentResult> {
  const condition = conditionText(input.condition);
  if (!isScope(input.scope) || condition === "long") return { status: "invalid" };
  const fields = input.scope === "showcase" ? pickKnown(input.fields ?? [], SHOWCASE_FIELDS) : [];
  const bans = pickKnown(input.bans ?? [], PUBLIC_BANS);
  const locations = input.scope === "showcase" ? placeIds(input.locationIds ?? []) : [];
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("give_public_data_consent", {
    p_scope: input.scope,
    p_version: PUBLIC_DATA_VERSION,
    p_fields: fields,
    p_bans: bans,
    p_condition: condition as string,
    p_location_ids: locations,
  });
  if (error) {
    if (error.code === "42501" || error.code === "22023") return { status: "invalid" };
    console.error("giving a consent to publish failed", error.code);
    return { status: "failed" };
  }
  refresh();
  return { status: "done" };
}

/** Revoking stops the publication at once (art. 10.1 part 13); for the showcase it closes the showcase. */
export async function revokePublicConsent(scope: PublicScope): Promise<ConsentResult> {
  if (!isScope(scope)) return { status: "invalid" };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("revoke_public_data_consent", { p_scope: scope });
  if (error) {
    console.error("revoking a consent to publish failed", error.code);
    return { status: "failed" };
  }
  refresh();
  return { status: "done" };
}
