import { describe, expect, it } from "vitest";
import { isDisputeReason, isRating, reviewText } from "./reviews";

describe("reviews", () => {
  it("takes a rating of 1 to 5 and the four dispute reasons", () => {
    expect([0, 1, 5, 6, 4.5].map(isRating)).toEqual([false, true, true, false, false]);
    expect(["insult", "false_facts", "not_my_client", "other", "spam"].map(isDisputeReason)).toEqual([true, true, true, true, false]);
  });

  it("trims a text, empty is none, over 2000 characters is too long", () => {
    expect(reviewText("  Хорошо  ")).toBe("Хорошо");
    expect(reviewText("   ")).toBeNull();
    expect(reviewText(null)).toBeNull();
    expect(reviewText("а".repeat(2001))).toBe("long");
  });
});
