import "server-only";
import { displayName } from "@/lib/pairs/clients";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { type ContactRequestStatus, isContactRequestId } from "./request";

export const SIGNED_OUT = "signed-out";

/** An unanswered request older than this reads as expired, as the answer RPCs would mark it. */
const EXPIRES_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

export type ContactRequest = {
  id: string;
  status: ContactRequestStatus;
  /** Who asks, and from which side of the pair. */
  requesterName: string;
  requesterSide: "trainer" | "client";
};

/**
 * The contact request with this id when the signed-in user is the one asked (/contact/<id>); null when there is
 * no such request or someone else was asked.
 */
export async function loadContactRequest(id: string): Promise<ContactRequest | typeof SIGNED_OUT | null> {
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  const userId = session?.claims.sub;
  if (!userId) return SIGNED_OUT;
  if (!isContactRequestId(id)) return null;

  const { data: request, error } = await supabase
    .from("contact_requests")
    .select("id, status, created_at, requester_id, coaching:coachings(trainer_id)")
    .eq("id", id)
    .eq("recipient_id", userId)
    .maybeSingle();
  if (error) throw new Error(`loading a contact request failed: ${error.code}`);
  if (!request) return null;

  const { data: person, error: personError } = await supabase
    .from("profiles")
    .select("first_name, last_name, display_name, username")
    .eq("id", request.requester_id)
    .maybeSingle();
  if (personError) throw new Error(`loading the requester failed: ${personError.code}`);

  const stale = request.status === "pending" && Date.now() - new Date(request.created_at).getTime() > EXPIRES_AFTER_MS;
  return {
    id: request.id,
    status: stale ? "expired" : request.status,
    requesterName: displayName(person ?? undefined),
    requesterSide: request.coaching?.trainer_id === request.requester_id ? "trainer" : "client",
  };
}
