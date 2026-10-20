"use server";

import type { JoinFailure } from "@/lib/client-links/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type JoinInvitedState =
  | { status: "idle" }
  | { status: "joined"; coachingId: string }
  | { status: "error"; reason: JoinFailure | "notInvited" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What join_invited_trainer raises, as the screen words it; the rest are the ones of any join (join_pair). */
const FAILURES: Record<string, JoinFailure | "notInvited"> = {
  not_invited: "notInvited",
  trainer_unavailable: "unavailable",
  plan_limit_reached: "limit",
  account_deleting: "deleting",
};

/**
 * "Заниматься" on /client/invite-trainer: the signed-in user becomes the client of a trainer who came by their
 * inviter code (the database checks that they invited this trainer and the trainer's limits). A pair that already
 * exists comes back as joined too.
 */
export async function joinInvitedTrainer(_previous: JoinInvitedState, formData: FormData): Promise<JoinInvitedState> {
  const trainerId = String(formData.get("trainer") ?? "");
  if (!UUID.test(trainerId)) return { status: "error", reason: "notInvited" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("join_invited_trainer", { p_trainer_id: trainerId });
  if (error || !data) {
    const reason = (error && FAILURES[error.message]) ?? "failed";
    if (reason === "failed") console.error("joining an invited trainer failed", error?.code);
    return { status: "error", reason };
  }
  return { status: "joined", coachingId: data };
}
