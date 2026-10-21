"use server";

import { isBadgeCode } from "@/lib/gamification/gamification";
import type { StoryCardResult } from "@/lib/monthly-report/actions";
import { isMomentKind } from "@/lib/monthly-report/report";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * A story card of the client's milestone (by id) or badge (by code), marketing backlog 4. The database checks that
 * the moment is the caller's and freezes what the card prints; "consent" asks for the consent to publish story cards
 * first (152-FZ art. 10.1), as on the monthly report.
 */
export async function createMomentCard(input: { kind: string; ref: string }): Promise<StoryCardResult> {
  if (!isMomentKind(input.kind)) return { status: "failed" };
  if (input.kind === "milestone" ? !ID.test(input.ref) : !isBadgeCode(input.ref)) return { status: "failed" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_moment_card", { p_kind: input.kind, p_ref: input.ref });
  if (error?.message === "consent_required") return { status: "consent" };
  if (error || typeof data !== "string") {
    console.error("creating a moment card failed", error?.code);
    return { status: "failed" };
  }
  return { status: "created", id: data };
}
