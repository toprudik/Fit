import { describe, expect, it } from "vitest";
import { honorsFrom, isTrainerHonor } from "./honors";

describe("trainer honors", () => {
  it("knows founder and ambassador only", () => {
    expect(isTrainerHonor("founder")).toBe(true);
    expect(isTrainerHonor("ambassador")).toBe(true);
    expect(isTrainerHonor("verified")).toBe(false);
  });

  it("keeps the showcase order and drops anything unknown", () => {
    expect(honorsFrom(["ambassador", "founder", "ambassador", "vip"])).toEqual(["founder", "ambassador"]);
    expect(honorsFrom(null)).toEqual([]);
  });
});
