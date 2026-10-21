import { describe, expect, it } from "vitest";
import {
  formatMonth,
  formatSleep,
  monthFromParam,
  monthParam,
  previousMonth,
  reportFrom,
  sharedReportFrom,
  shareTargetsFrom,
  storyCardFrom,
  storyOptions,
  weightChange,
} from "./report";

const report = {
  month: "2026-09-01",
  workouts: 1,
  sessions: { total: 3, trainers: [{ coaching_id: "c1", name: "Ира", count: 2 }, { coaching_id: "c2", name: null, count: 1 }] },
  records: [{ exercise_id: "e1", name: "Squat", type: "max_weight", value: 100, achieved_at: "2026-09-20T06:00:00Z" }],
  measurements: [{ kind: "weight", from: 80, to: 78.5 }],
};

describe("monthly report", () => {
  it("reads the report and leaves out the missing sections", () => {
    const parsed = reportFrom(report);
    expect(parsed?.sessions?.total).toBe(3);
    expect(parsed?.steps).toBeUndefined();
    expect(reportFrom(null)).toBeNull();
    expect(reportFrom({ month: "2026-09-02" })).toBeNull();
  });

  it("reads the streaks and the new badges", () => {
    const parsed = reportFrom({ ...report, streaks: { workouts: 2, diary: 3 }, badges: ["sessions_1", "diary_7"] });
    expect(parsed?.streaks).toEqual({ workouts: 2, diary: 3 });
    expect(parsed?.badges).toEqual(["sessions_1", "diary_7"]);
    expect(reportFrom(report)?.streaks).toBeUndefined();
  });

  it("reads a report closed without the health data consent and offers no health cards", () => {
    const closed = reportFrom({ month: "2026-09-01", sessions: report.sessions, health_closed: true });
    expect(closed?.health_closed).toBe(true);
    expect(closed && storyOptions(closed).map((option) => option.kind)).toEqual(["sessions", "trainer", "trainer"]);
  });

  it("turns months into URL parts and back", () => {
    expect(monthFromParam("2026-09")).toBe("2026-09-01");
    expect(monthFromParam("2026-13")).toBeNull();
    expect(monthFromParam("2026-09-01")).toBeNull();
    expect(monthParam("2026-09-01")).toBe("2026-09");
    expect(previousMonth("2026-10-17")).toBe("2026-09-01");
    expect(previousMonth("2027-01-01")).toBe("2026-12-01");
  });

  it("names the month in both languages", () => {
    expect(formatMonth("ru", "2026-09-01")).toBe("сентябрь 2026");
    expect(formatMonth("en", "2026-09-01")).toBe("September 2026");
  });

  it("formats sleep in hours and minutes", () => {
    const units = { h: "ч", min: "мин" };
    expect(formatSleep(450, units)).toBe("7 ч 30 мин");
    expect(formatSleep(480, units)).toBe("8 ч");
    expect(formatSleep(40, units)).toBe("40 мин");
  });

  it("offers a card per trainer and the weight card only when weight moved", () => {
    const parsed = reportFrom(report)!;
    expect(weightChange(parsed)).toBe(-1.5);
    expect(storyOptions(parsed).map((option) => option.kind)).toEqual(["sessions", "trainer", "trainer", "records", "weight"]);
    const still = reportFrom({ ...report, measurements: [{ kind: "weight", from: 80, to: 80 }] })!;
    expect(weightChange(still)).toBeNull();
    expect(storyOptions(still).map((option) => option.kind)).not.toContain("weight");
  });

  it("offers a card per running streak and one for the new badges", () => {
    const parsed = reportFrom({ ...report, streaks: { workouts: 2, steps: 5 }, badges: ["sessions_1"] })!;
    expect(storyOptions(parsed).map((option) => option.kind)).toEqual([
      "sessions",
      "trainer",
      "trainer",
      "records",
      "streak_workouts",
      "streak_steps",
      "badges",
      "weight",
    ]);
    expect(storyCardFrom({ kind: "badges", month: "2026-09-01", data: { count: 2, code: "diary_7" } })?.data.code).toBe("diary_7");
  });

  it("reads a story card", () => {
    expect(storyCardFrom({ kind: "sessions", month: "2026-09-01", data: { count: 2 } })?.data.count).toBe(2);
    expect(storyCardFrom({ kind: "photo", month: "2026-09-01", data: {} })).toBeNull();
    expect(storyCardFrom(null)).toBeNull();
    expect(storyCardFrom({ kind: "trainer", month: "2026-09-01", data: { count: 2, name: "Ира", slug: "ira-fit" } })?.data.slug).toBe("ira-fit");
    expect(storyCardFrom({ kind: "trainer", month: "2026-09-01", data: { count: 2, slug: "../admin" } })).toBeNull();
  });
});

describe("sending the month to a trainer (§4 rule 3)", () => {
  it("reads the pairs to send to", () => {
    expect(shareTargetsFrom([{ coaching_id: "c1", name: "Ира", shared_at: null }, { coaching_id: "c2", name: null, shared_at: "2026-10-02T09:00:00Z" }])).toEqual([
      { coachingId: "c1", name: "Ира", sharedAt: null },
      { coachingId: "c2", name: null, sharedAt: "2026-10-02T09:00:00Z" },
    ]);
    expect(shareTargetsFrom(null)).toEqual([]);
  });

  it("reads the copy the trainer gets", () => {
    expect(sharedReportFrom({ report, shared_at: "2026-10-02T09:00:00Z" })?.report.month).toBe("2026-09-01");
    expect(sharedReportFrom({ report: { month: "september" }, shared_at: "2026-10-02T09:00:00Z" })).toBeNull();
    expect(sharedReportFrom(null)).toBeNull();
  });
});
