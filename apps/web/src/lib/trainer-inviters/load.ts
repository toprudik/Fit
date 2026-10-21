import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type InvitedTrainer = {
  trainerId: string;
  name: string;
  photoUrl: string | null;
  joinedAt: string;
  /** The caller's live pair with this trainer; null until they start one. */
  coachingId: string | null;
  available: boolean;
};

export type TrainerInviter = { code: string; timeZone: string; trainers: InvitedTrainer[] };

/**
 * "Пригласить своего тренера" (marketing backlog 16): the caller's inviter code (made on the first visit), the
 * trainers who came by it and the time zone for their dates. "signed-out" without a session, "trainer" for a
 * trainer, who invites colleagues with the trainer referral link instead.
 */
export async function loadTrainerInviter(): Promise<TrainerInviter | "signed-out" | "trainer"> {
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  if (!session?.claims.sub) return "signed-out";
  const code = await supabase.rpc("my_trainer_inviter_code");
  if (code.error?.message === "already_trainer") return "trainer";
  if (code.error) throw new Error(`loading the inviter code failed: ${code.error.code}`);
  const [trainers, settings] = await Promise.all([
    supabase.rpc("my_invited_trainers"),
    supabase.from("user_settings").select("time_zone").eq("user_id", session.claims.sub).maybeSingle(),
  ]);
  if (trainers.error) throw new Error(`loading invited trainers failed: ${trainers.error.code}`);
  if (settings.error) throw new Error(`loading the time zone failed: ${settings.error.code}`);
  return {
    code: code.data,
    timeZone: settings.data?.time_zone ?? "Europe/Moscow",
    trainers: trainers.data.map((row) => ({
      trainerId: row.trainer_id,
      name: [row.first_name, row.last_name].map((part) => part?.trim()).filter(Boolean).join(" "),
      photoUrl: row.photo_url,
      joinedAt: row.joined_at,
      coachingId: row.coaching_id,
      available: row.available,
    })),
  };
}
