import type { Database } from "@/lib/supabase/database.types";

/** Trainer milestones (marketing 14): the triggers of migration 20261020162417 record them, in this screen order. */
export type TrainerMilestoneKind = Database["public"]["Enums"]["trainer_milestone_kind"];
export const TRAINER_MILESTONES = [
  "first_trial_client",
  "clients_5",
  "weeks_4",
  "sessions_100",
  "sessions_500",
] as const satisfies readonly TrainerMilestoneKind[];

/** What the count behind a milestone must reach; the other two are reached or not, with nothing to count. */
const TARGETS: Partial<Record<TrainerMilestoneKind, { count: "clients" | "sessions"; target: number }>> = {
  clients_5: { count: "clients", target: 5 },
  sessions_100: { count: "sessions", target: 100 },
  sessions_500: { count: "sessions", target: 500 },
};

export function isTrainerMilestoneKind(value: unknown): value is TrainerMilestoneKind {
  return typeof value === "string" && (TRAINER_MILESTONES as readonly string[]).includes(value);
}

export type TrainerMilestoneRow = {
  kind: TrainerMilestoneKind;
  achievedAt: string | null;
  /** On the way to a counted milestone: how far, 0 to 1, and the numbers for "3 из 5". */
  progress: { current: number; target: number; share: number } | null;
};

/**
 * One row per milestone in screen order. A reached one keeps its date even when the count later dropped (an
 * ended pair); one not reached shows the way to it when it is counted.
 */
export function trainerMilestoneRows(
  reached: readonly { kind: unknown; achieved_at: string }[],
  counts: { clients: number; sessions: number },
): TrainerMilestoneRow[] {
  const dates = new Map(reached.filter((row) => isTrainerMilestoneKind(row.kind)).map((row) => [row.kind, row.achieved_at]));
  return TRAINER_MILESTONES.map((kind) => {
    const achievedAt = dates.get(kind) ?? null;
    const goal = TARGETS[kind];
    if (achievedAt || !goal) return { kind, achievedAt, progress: null };
    const current = Math.max(0, Math.min(counts[goal.count], goal.target));
    return { kind, achievedAt, progress: { current, target: goal.target, share: current / goal.target } };
  });
}
