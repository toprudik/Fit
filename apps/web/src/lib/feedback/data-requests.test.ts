import { describe, expect, it } from "vitest";
import { dueState, requestToday } from "./data-requests";

describe("data request deadlines", () => {
  it("counts the day in Moscow", () => {
    expect(requestToday(new Date("2026-10-19T21:30:00Z"))).toBe("2026-10-20");
    expect(requestToday(new Date("2026-10-19T20:30:00Z"))).toBe("2026-10-19");
  });

  it("marks a request overdue the day after its deadline", () => {
    expect(dueState("2026-11-02", "2026-10-30")).toBe("open");
    expect(dueState("2026-11-02", "2026-11-02")).toBe("today");
    expect(dueState("2026-11-02", "2026-11-03")).toBe("overdue");
  });
});
