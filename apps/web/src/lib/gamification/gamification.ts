/**
 * Streaks and badges (PRD wave-3 §2.1–2.2). The database works the streaks out and awards the badges
 * (migration 20261017100917_streaks_badges.sql); this module only shapes them for the screens.
 */

/** The badge catalogue in display order, as seeded in public.badges. */
export const BADGE_CODES = [
  "sessions_1",
  "sessions_10",
  "sessions_25",
  "sessions_50",
  "sessions_100",
  "workout_streak_4",
  "workout_streak_12",
  "workout_streak_26",
  "workout_streak_52",
  "diary_7",
  "diary_30",
  "diary_100",
  "records_1",
  "records_10",
  "homework_10",
  "challenge_joined",
  "challenge_done",
  "challenge_winner",
  "referral_friend",
  "season_done",
] as const;

export type BadgeCode = (typeof BADGE_CODES)[number];

export function isBadgeCode(value: unknown): value is BadgeCode {
  return (BADGE_CODES as readonly unknown[]).includes(value);
}

export type EarnedBadge = { code: BadgeCode; awardedAt: string; seen: boolean };

/** A row of the badge list: earned ones carry when, locked ones don't. */
export type BadgeItem = { code: BadgeCode; awardedAt: string | null; isNew: boolean };

/** The whole catalogue in order, earned badges first by date (newest first), then the locked ones. */
export function badgeItems(earned: EarnedBadge[]): BadgeItem[] {
  const byCode = new Map(earned.map((badge) => [badge.code, badge]));
  const got = [...earned]
    .sort((a, b) => b.awardedAt.localeCompare(a.awardedAt) || BADGE_CODES.indexOf(a.code) - BADGE_CODES.indexOf(b.code))
    .map((badge) => ({ code: badge.code, awardedAt: badge.awardedAt, isNew: !badge.seen }));
  const locked = BADGE_CODES.filter((code) => !byCode.has(code)).map((code) => ({ code, awardedAt: null, isNew: false }));
  return [...got, ...locked];
}

/** Streaks as the screens show them; null where the trainer has no share for it. */
export type Streaks = {
  /** Weeks in a row that met the weekly goal. */
  workouts: number;
  weekGoal: number;
  /** Workouts so far this week. */
  weekDone: number;
  diary: number | null;
  steps: number | null;
};

export const WEEK_GOAL_MIN = 1;
export const WEEK_GOAL_MAX = 14;
/** Choices offered on screen; the database takes up to 14. */
export const WEEK_GOAL_OPTIONS = [1, 2, 3, 4, 5, 6, 7] as const;

export function isWeekGoal(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= WEEK_GOAL_MIN && (value as number) <= WEEK_GOAL_MAX;
}

type StreakRow = { workouts: number; week_goal: number; week_done: number; diary: number | null; steps: number | null };

export function toStreaks(row: StreakRow | null | undefined): Streaks | null {
  if (!row) return null;
  return { workouts: row.workouts, weekGoal: row.week_goal, weekDone: row.week_done, diary: row.diary, steps: row.steps };
}
