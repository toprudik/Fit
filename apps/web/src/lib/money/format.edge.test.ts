import { describe, expect, it } from "vitest";
import { parseMajor } from "./format";

describe("parseMajor edges", () => {
  it("rounds to the nearest kopeck, not down", () => {
    expect(parseMajor("1.15")).toBe(115);
    expect(parseMajor("0.29")).toBe(29);
  });

  it("accepts the highest price and nothing above it", () => {
    expect(parseMajor("10000000")).toBe(1_000_000_000);
    expect(parseMajor("10000000.01")).toBeNull();
  });
});
