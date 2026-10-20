import { describe, expect, it } from "vitest";
import { overlapsAny, slotsInWindow, type TemplateWindow } from "./template";

const morning: TemplateWindow = { isoWeekday: 4, start: "10:00", end: "11:00", durationMin: 60, mode: "offline", locationId: null, meetingUrl: null };

describe("week template edges", () => {
  it("fits one slot into a window exactly its length", () => {
    expect(slotsInWindow({ start: "09:00", end: "10:00", durationMin: 60 }, 0)).toBe(1);
  });

  it("lets a window end where the next one starts", () => {
    expect(overlapsAny({ ...morning, start: "09:00", end: "10:00" }, [morning])).toBe(false);
  });
});
