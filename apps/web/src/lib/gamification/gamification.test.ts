import { describe, expect, it } from "vitest";
import { BADGE_CODES, badgeItems, isBadgeCode, isWeekGoal, toStreaks } from "./gamification";

describe("badgeItems", () => {
  it("lists earned badges newest first, then the locked ones in catalogue order", () => {
    const items = badgeItems([
      { code: "sessions_1", awardedAt: "2026-10-01T10:00:00Z", seen: true },
      { code: "diary_7", awardedAt: "2026-10-10T10:00:00Z", seen: false },
    ]);
    expect(items.slice(0, 2)).toEqual([
      { code: "diary_7", awardedAt: "2026-10-10T10:00:00Z", isNew: true },
      { code: "sessions_1", awardedAt: "2026-10-01T10:00:00Z", isNew: false },
    ]);
    expect(items).toHaveLength(BADGE_CODES.length);
    expect(items[2]).toEqual({ code: "sessions_10", awardedAt: null, isNew: false });
  });
});

describe("guards", () => {
  it("knows the catalogue and the weekly goal range", () => {
    expect(isBadgeCode("records_10")).toBe(true);
    expect(isBadgeCode("coins_100")).toBe(false);
    expect([0, 1, 14, 15, 2.5].map(isWeekGoal)).toEqual([false, true, true, false, false]);
  });

  it("shapes a streaks row", () => {
    expect(toStreaks({ workouts: 3, week_goal: 2, week_done: 1, diary: null, steps: 5 })).toEqual({
      workouts: 3,
      weekGoal: 2,
      weekDone: 1,
      diary: null,
      steps: 5,
    });
    expect(toStreaks(undefined)).toBeNull();
  });
});
