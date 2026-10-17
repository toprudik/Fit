/**
 * Group challenges and their leaderboards (PRD wave-3 §2.3–2.4). The database counts the scores, keeps the
 * leaderboard private and awards the badges (migration 20261017103914_group_challenges.sql); this module only
 * holds the rules the forms need and shapes the rows for the screens.
 */
/** What a challenge counts. Weight, measurements and photos are never a metric (§2.4). */
export const CHALLENGE_METRICS = ["workouts", "steps", "diary_days", "adherence_days"] as const;
export type ChallengeMetric = (typeof CHALLENGE_METRICS)[number];

export function isChallengeMetric(value: unknown): value is ChallengeMetric {
  return (CHALLENGE_METRICS as readonly unknown[]).includes(value);
}

/** The data_shares category a metric is counted from; the client must have it on to join (§2.3-12). */
export type ChallengeShare = "workouts" | "steps" | "nutrition";

export function shareOfMetric(metric: ChallengeMetric): ChallengeShare {
  if (metric === "workouts") return "workouts";
  if (metric === "steps") return "steps";
  return "nutrition";
}

export const CHALLENGE_WEEKS_MIN = 1;
export const CHALLENGE_WEEKS_MAX = 12;
/** Lengths offered on screen; the database takes any whole number of weeks from 1 to 12. */
export const CHALLENGE_WEEK_OPTIONS = [1, 2, 3, 4, 6, 8, 12] as const;
export const CHALLENGE_TITLE_MAX = 80;
export const CHALLENGE_GOAL_MAX = 10_000_000;
export const CHALLENGE_ALIAS_MAX = 30;

export function isChallengeWeeks(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= CHALLENGE_WEEKS_MIN && value <= CHALLENGE_WEEKS_MAX;
}

export function isChallengeGoal(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= CHALLENGE_GOAL_MAX;
}

/** A goal typed by the trainer: empty means none; anything else must be a whole number in range. */
export function parseGoal(text: string): { ok: true; value: number | null } | { ok: false } {
  const trimmed = text.replace(/\s/g, "");
  if (!trimmed) return { ok: true, value: null };
  if (!/^\d+$/.test(trimmed)) return { ok: false };
  const value = Number(trimmed);
  return isChallengeGoal(value) ? { ok: true, value } : { ok: false };
}

export const CHALLENGE_STATES = ["upcoming", "active", "finished", "cancelled"] as const;
export type ChallengeState = (typeof CHALLENGE_STATES)[number];

export function isChallengeState(value: unknown): value is ChallengeState {
  return (CHALLENGE_STATES as readonly unknown[]).includes(value);
}

/** The state of a challenge as the trainer's list shows it. */
export function stateOf(row: { cancelled_at: string | null; finished_at: string | null; starts_on: string }, today: string): ChallengeState {
  if (row.cancelled_at) return "cancelled";
  if (row.finished_at) return "finished";
  return row.starts_on > today ? "upcoming" : "active";
}

export type Challenge = {
  id: string;
  title: string;
  metric: ChallengeMetric;
  goal: number | null;
  startsOn: string;
  endsOn: string;
  leaderboard: boolean;
  state: ChallengeState;
};

/** A row of the leaderboard. hidden: the participant stopped sharing the metric, the score is their last one. */
export type BoardRow = { place: number; name: string; alias: string | null; score: number; isMe: boolean; shown: boolean; hidden: boolean };

export function toBoardRows(
  rows: { place: number; name: string; alias: string | null; score: number; is_me: boolean; shown: boolean; hidden: boolean }[],
): BoardRow[] {
  return rows.map((row) => ({
    place: row.place,
    name: row.name,
    alias: row.alias ?? null,
    score: row.score,
    isMe: row.is_me,
    shown: row.shown,
    hidden: row.hidden,
  }));
}

/** Join errors the screens explain. */
export type JoinError = "share_needed" | "closed" | "failed";

export function joinErrorOf(message: string | undefined): JoinError {
  if (message === "share_needed") return "share_needed";
  if (message === "challenge_closed") return "closed";
  return "failed";
}
