import { describe, expect, it } from "vitest";
import { reportFrom, weightChange } from "./report";

describe("weightChange edges", () => {
  it("rounds a small loss to a tenth of a kilo", () => {
    const parsed = reportFrom({ month: "2026-09-01", workouts: 0, measurements: [{ kind: "weight", from: 80.3, to: 80.1 }] })!;
    expect(weightChange(parsed)).toBe(-0.2);
  });
});
