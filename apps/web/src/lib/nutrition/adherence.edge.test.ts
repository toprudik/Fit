import { describe, expect, it } from "vitest";
import { trendOf } from "./adherence";

describe("trendOf edges", () => {
  it("calls a change of exactly five points a trend", () => {
    expect(trendOf({ share: 55, previous: 50 })).toBe("up");
    expect(trendOf({ share: 45, previous: 50 })).toBe("down");
  });

  it("calls a smaller change flat", () => {
    expect(trendOf({ share: 54, previous: 50 })).toBe("flat");
    expect(trendOf({ share: 46, previous: 50 })).toBe("flat");
  });
});
