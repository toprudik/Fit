import { describe, expect, it } from "vitest";
import { addDays, formatMinutes, isoWeekday, localParts, localToUtc, parseDay, parseMinutes, weekDays, weekStart } from "./time";

describe("days", () => {
  it("accepts only real days", () => {
    expect(parseDay("2026-10-16")).toBe("2026-10-16");
    expect(parseDay("2026-02-30")).toBeNull();
    expect(parseDay("16.10.2026")).toBeNull();
    expect(parseDay(undefined)).toBeNull();
  });

  it("counts weeks from Monday", () => {
    expect(isoWeekday("2026-10-18")).toBe(7);
    expect(weekStart("2026-10-18")).toBe("2026-10-12");
    expect(weekStart("2026-10-12")).toBe("2026-10-12");
    expect(weekDays("2026-12-28")).toEqual(["2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02", "2027-01-03"]);
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("wall time", () => {
  it("reads an instant in the trainer's zone", () => {
    expect(localParts("2026-10-15T21:30:00Z", "Europe/Moscow")).toEqual({ day: "2026-10-16", minutes: 30 });
  });

  it("turns a wall time into an instant across daylight saving time (SCHED-18)", () => {
    expect(localToUtc("2026-03-28", 480, "Europe/Berlin").toISOString()).toBe("2026-03-28T07:00:00.000Z");
    expect(localToUtc("2026-03-29", 480, "Europe/Berlin").toISOString()).toBe("2026-03-29T06:00:00.000Z");
    expect(localToUtc("2026-10-16", 0, "Europe/Moscow").toISOString()).toBe("2026-10-15T21:00:00.000Z");
  });

  it("writes and reads times of day", () => {
    expect(formatMinutes(545)).toBe("09:05");
    expect(parseMinutes("09:05")).toBe(545);
    expect(parseMinutes("09:05:00")).toBe(545);
    expect(parseMinutes("24:00")).toBeNull();
  });
});
