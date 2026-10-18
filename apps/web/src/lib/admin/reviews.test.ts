import { describe, expect, it } from "vitest";
import { disputesHref, isDisputeStatus, reviewExcerpt } from "./reviews";

describe("admin reviews", () => {
  it("knows the filter statuses", () => {
    expect(isDisputeStatus("open")).toBe(true);
    expect(isDisputeStatus("hidden")).toBe(true);
    expect(isDisputeStatus("dismissed")).toBe(false);
    expect(isDisputeStatus(undefined)).toBe(false);
  });

  it("links the filters", () => {
    expect(disputesHref("kept")).toBe("/admin/reviews?status=kept");
    expect(disputesHref(null)).toBe("/admin/reviews?status=all");
  });

  it("cuts a long review to one line", () => {
    expect(reviewExcerpt(null)).toBeNull();
    expect(reviewExcerpt("  \n ")).toBeNull();
    expect(reviewExcerpt("Хороший\nтренер")).toBe("Хороший тренер");
    const excerpt = reviewExcerpt("а".repeat(200), 10);
    expect(excerpt).toBe(`${"а".repeat(9)}…`);
  });
});
