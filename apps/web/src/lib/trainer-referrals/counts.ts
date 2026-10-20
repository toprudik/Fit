import type { InvitedTrainer } from "./load";

/** What the "Пригласить тренера" screen counts (marketing backlog 6): who came, who works, bonuses that wait. */
export type TrainerReferralCounts = { invited: number; active: number; bonusesPending: number };

export function referralCounts(trainers: InvitedTrainer[]): TrainerReferralCounts {
  return {
    invited: trainers.length,
    active: trainers.filter((trainer) => trainer.status !== "void" && trainer.active).length,
    bonusesPending: trainers.filter((trainer) => trainer.bonusPending).length,
  };
}
