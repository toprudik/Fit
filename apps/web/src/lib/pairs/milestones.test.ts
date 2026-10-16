import { describe, expect, it } from "vitest";
import { nextMilestone, type Milestone } from "./milestones";

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
