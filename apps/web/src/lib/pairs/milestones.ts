import type { Database } from "@/lib/supabase/database.types";

export type MilestoneKind = Database["public"]["Enums"]["milestone_kind"];

/** Attended sessions of each milestone (PRD wave-1 §2.11-9). */
export const MILESTONE_SESSIONS: Record<MilestoneKind, number> = {
  sessions_10: 10,
  sessions_25: 25,
  sessions_50: 50,
  sessions_100: 100,
};

export type Milestone = { id: string; kind: MilestoneKind; achievedAt: string };

/** How long a reached milestone counts as new: the Da-moment plays for it on the viewer's first visit within that time. */
export const NEW_MILESTONE_DAYS = 14;

/**
 * The next milestone and how many attended sessions are left to it, or null after the last one. A milestone stays
 * once shown even if forgiving lowers the count (PRD 2.11 edge cases), so the next one is past both the count and
 * the milestones already reached.
 */
export function nextMilestone(attended: number, reached: Milestone[]): { sessions: number; left: number; share: number } | null {
  const past = Math.max(attended, ...reached.map((milestone) => MILESTONE_SESSIONS[milestone.kind]));
  const thresholds = Object.values(MILESTONE_SESSIONS);
  const next = thresholds.find((sessions) => sessions > past);
  if (next === undefined) return null;
  const previous = [0, ...thresholds].filter((sessions) => sessions < next).at(-1) ?? 0;
  return { sessions: next, left: next - attended, share: Math.max(0, (attended - previous) / (next - previous)) };
}

/** A pair as the trainer's "Сегодня" sees it for milestones. */
export type TodayPair = { coachingId: string; name: string; live: boolean; archived: boolean; attended: number; milestones: Milestone[] };

export type TodayMilestones = {
  /** Milestones reached within NEW_MILESTONE_DAYS, newest first. */
  reached: { coachingId: string; name: string; milestone: Milestone }[];
  /** Live pairs whose next attended session reaches a milestone, by name. */
  upcoming: { coachingId: string; name: string; sessions: number; share: number }[];
};

/**
 * Milestones for the trainer's "Сегодня" (screens.md, Сегодня): the fresh ones to congratulate on and the ones the
 * next session reaches, so the trainer can get ready. Archived and ended pairs stay out.
 */
export function todayMilestones(pairs: TodayPair[], now: Date): TodayMilestones {
  const since = now.getTime() - NEW_MILESTONE_DAYS * 86_400_000;
  const shown = pairs.filter((pair) => pair.live && !pair.archived);
  const reached = shown
    .flatMap((pair) =>
      pair.milestones
        .filter((milestone) => new Date(milestone.achievedAt).getTime() >= since)
        .map((milestone) => ({ coachingId: pair.coachingId, name: pair.name, milestone })),
    )
    .sort((a, b) => b.milestone.achievedAt.localeCompare(a.milestone.achievedAt));
  const upcoming = shown
    .flatMap((pair) => {
      const next = nextMilestone(pair.attended, pair.milestones);
      return next?.left === 1 ? [{ coachingId: pair.coachingId, name: pair.name, sessions: next.sessions, share: next.share }] : [];
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  return { reached, upcoming };
}
