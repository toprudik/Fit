import { describe, expect, it } from "vitest";
import { isTrainerMilestoneKind, trainerMilestoneRows } from "./milestones";

describe("trainer milestones", () => {
  it("knows the five kinds only", () => {
    expect(isTrainerMilestoneKind("weeks_4")).toBe(true);
    expect(isTrainerMilestoneKind("sessions_1000")).toBe(false);
    expect(isTrainerMilestoneKind(null)).toBe(false);
  });

  it("shows every milestone in screen order, with dates for the reached ones", () => {
    const rows = trainerMilestoneRows(
      [
        { kind: "clients_5", achieved_at: "2026-10-01T10:00:00Z" },
        { kind: "unknown", achieved_at: "2026-10-02T10:00:00Z" },
      ],
      { clients: 3, sessions: 140 },
    );
    expect(rows.map((row) => row.kind)).toEqual(["first_trial_client", "clients_5", "weeks_4", "sessions_100", "sessions_500"]);
    expect(rows[1]).toEqual({ kind: "clients_5", achievedAt: "2026-10-01T10:00:00Z", progress: null });
    expect(rows[0].progress).toBeNull();
    expect(rows[2].progress).toBeNull();
  });

  it("counts the way to a counted milestone and caps it at the target", () => {
    const rows = trainerMilestoneRows([], { clients: 7, sessions: 140 });
    expect(rows.find((row) => row.kind === "clients_5")?.progress).toEqual({ current: 5, target: 5, share: 1 });
    expect(rows.find((row) => row.kind === "sessions_100")?.progress).toEqual({ current: 100, target: 100, share: 1 });
    expect(rows.find((row) => row.kind === "sessions_500")?.progress).toEqual({ current: 140, target: 500, share: 0.28 });
  });
});
