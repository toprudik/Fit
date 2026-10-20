import { describe, expect, it } from "vitest";
import { cohortWeeks, growth } from "./metrics";

describe("owner metrics edges", () => {
  it("rounds growth to the nearest whole percent both ways", () => {
    expect(growth(2, 3)).toBe(-33);
    expect(growth(5, 3)).toBe(67);
  });

  it("shows at most twelve cohorts", () => {
    expect(cohortWeeks(26)).toBe(12);
  });
});
