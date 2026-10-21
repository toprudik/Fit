import { describe, expect, it } from "vitest";
import { previousMonth } from "./month";

describe("previousMonth", () => {
  it("takes the month before the one running in the trainer's zone", () => {
    expect(previousMonth("Europe/Moscow", new Date("2026-10-20T12:00:00Z"))).toBe("2026-09");
    // 31 October 22:00 UTC is already 1 November in Moscow.
    expect(previousMonth("Europe/Moscow", new Date("2026-10-31T22:00:00Z"))).toBe("2026-10");
    expect(previousMonth("UTC", new Date("2027-01-05T00:00:00Z"))).toBe("2026-12");
  });
});
