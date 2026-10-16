import { describe, expect, it } from "vitest";
import { overlapsAny, slotsInWindow, sortWindows, type TemplateWindow } from "./template";

const tuesday: TemplateWindow = { isoWeekday: 2, start: "09:00", end: "13:00", durationMin: 60, mode: "offline", locationId: null, meetingUrl: null };

describe("week template", () => {
  it("counts slots the way the generator cuts them (SCHED-1)", () => {
    expect(slotsInWindow(tuesday, 0)).toBe(4);
    expect(slotsInWindow(tuesday, 30)).toBe(3);
    expect(slotsInWindow({ start: "09:00", end: "09:45", durationMin: 60 }, 0)).toBe(0);
  });

  it("finds overlapping windows on the same day only", () => {
    expect(overlapsAny({ ...tuesday, start: "12:00", end: "14:00" }, [tuesday])).toBe(true);
    expect(overlapsAny({ ...tuesday, start: "13:00", end: "14:00" }, [tuesday])).toBe(false);
    expect(overlapsAny({ ...tuesday, isoWeekday: 3 }, [tuesday])).toBe(false);
  });

  it("orders windows by day and time", () => {
    const later = { ...tuesday, start: "15:00", end: "17:00" };
    const monday = { ...tuesday, isoWeekday: 1 };
    expect(sortWindows([later, tuesday, monday])).toEqual([monday, tuesday, later]);
  });
});
