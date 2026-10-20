import { describe, expect, it } from "vitest";
import { periodOffset, periodRange } from "./period";

describe("period edges", () => {
  it("finds the first quarter from its last month", () => {
    expect(periodRange("quarter", "2026-03-15")).toEqual({ from: "2026-01-01", to: "2026-04-01" });
  });

  it("goes back at most sixty periods", () => {
    expect(periodOffset("-60")).toBe(-60);
    expect(periodOffset("-61")).toBe(0);
  });
});
