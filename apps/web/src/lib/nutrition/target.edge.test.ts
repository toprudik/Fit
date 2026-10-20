import { describe, expect, it } from "vitest";
import { macrosDisagree } from "./target";

describe("macrosDisagree edges", () => {
  it("lets macros exactly 5% away from the kcal pass", () => {
    expect(macrosDisagree({ kcal: 2000, proteinG: 100, fatG: 100, carbsG: 200 })).toBe(false);
  });
});
