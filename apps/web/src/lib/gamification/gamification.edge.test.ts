import { describe, expect, it } from "vitest";
import { badgeItems } from "./gamification";

describe("badgeItems edges", () => {
  it("orders badges earned at the same moment by the catalogue", () => {
    const at = "2026-10-05T10:00:00Z";
    const items = badgeItems([
      { code: "sessions_10", awardedAt: at, seen: true },
      { code: "sessions_1", awardedAt: at, seen: true },
    ]);
    expect(items.slice(0, 2).map((item) => item.code)).toEqual(["sessions_1", "sessions_10"]);
  });
});
