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
