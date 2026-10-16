import { describe, expect, it } from "vitest";
import { formatDay, formatSessionTime } from "./format";

describe("pair dates", () => {
  it("shows a session start in the given time zone", () => {
    expect(formatSessionTime("ru", "2026-10-15T15:30:00Z", "Europe/Moscow")).toBe("чт, 15 окт., 18:30");
    expect(formatSessionTime("en", "2026-10-15T15:30:00Z", "UTC")).toBe("Thu, Oct 15, 3:30 PM");
  });

  it("shows the day a pair started", () => {
    expect(formatDay("ru", "2026-03-02T22:00:00Z", "Europe/Moscow")).toBe("3 марта 2026 г.");
    expect(formatDay("en", "2026-03-03T10:00:00Z", "UTC")).toBe("March 3, 2026");
  });
});
