import { describe, expect, it } from "vitest";
import { nextMilestone, todayMilestones, type Milestone, type TodayPair } from "./milestones";

const m = (kind: Milestone["kind"], achievedAt = "2026-10-01T10:00:00Z"): Milestone => ({ id: kind, kind, achievedAt });

describe("nextMilestone", () => {
  it("counts down to 10 from the start", () => {
    expect(nextMilestone(0, [])).toEqual({ sessions: 10, left: 10, share: 0 });
    expect(nextMilestone(7, [])).toEqual({ sessions: 10, left: 3, share: 0.7 });
  });

  it("measures the share from the previous milestone", () => {
    expect(nextMilestone(13, [m("sessions_10")])).toEqual({ sessions: 25, left: 12, share: 0.2 });
  });

  it("keeps a reached milestone when forgiving lowers the count", () => {
    expect(nextMilestone(9, [m("sessions_10")])).toMatchObject({ sessions: 25, left: 16, share: 0 });
  });

  it("ends after 100", () => {
    expect(nextMilestone(100, [m("sessions_100")])).toBeNull();
    expect(nextMilestone(140, [])).toBeNull();
  });
});

describe("todayMilestones", () => {
  const now = new Date("2026-10-17T09:00:00Z");
  const pair = (over: Partial<TodayPair>): TodayPair => ({
    coachingId: "p",
    name: "Анна",
    live: true,
    archived: false,
    attended: 0,
    milestones: [],
    ...over,
  });

  it("lists milestones of the last two weeks, newest first", () => {
    const result = todayMilestones(
      [
        pair({ coachingId: "a", name: "Анна", attended: 11, milestones: [m("sessions_10", "2026-10-10T10:00:00Z")] }),
        pair({ coachingId: "b", name: "Борис", attended: 26, milestones: [m("sessions_10", "2026-08-01T10:00:00Z"), m("sessions_25", "2026-10-16T10:00:00Z")] }),
        pair({ coachingId: "c", name: "Вера", attended: 12, milestones: [m("sessions_10", "2026-09-01T10:00:00Z")] }),
      ],
      now,
    );
    expect(result.reached.map((row) => [row.coachingId, row.milestone.kind])).toEqual([
      ["b", "sessions_25"],
      ["a", "sessions_10"],
    ]);
  });

  it("names the pairs whose next session reaches a milestone", () => {
    const result = todayMilestones(
      [pair({ coachingId: "a", name: "Олег", attended: 9 }), pair({ coachingId: "b", name: "Анна", attended: 24, milestones: [m("sessions_10")] }), pair({ attended: 8 })],
      now,
    );
    expect(result.upcoming.map((row) => [row.coachingId, row.sessions])).toEqual([
      ["b", 25],
      ["a", 10],
    ]);
  });

  it("leaves out archived and ended pairs", () => {
    const result = todayMilestones(
      [pair({ archived: true, attended: 9 }), pair({ live: false, attended: 11, milestones: [m("sessions_10", "2026-10-15T10:00:00Z")] })],
      now,
    );
    expect(result).toEqual({ reached: [], upcoming: [] });
  });
});
