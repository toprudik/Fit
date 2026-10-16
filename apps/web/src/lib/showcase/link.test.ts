import { describe, expect, it } from "vitest";
import { isShowcaseSlug, normalizeSlug, showcasePath, showcaseTelegram, showcaseUrl } from "./link";

describe("showcase links", () => {
  it("accepts the addresses the database accepts", () => {
    expect(isShowcaseSlug("anna")).toBe(true);
    expect(isShowcaseSlug("trainer-x7k2mq")).toBe(true);
    expect(isShowcaseSlug("9lives")).toBe(true);
    expect(isShowcaseSlug("a".repeat(32))).toBe(true);
  });

  it("rejects everything else", () => {
    expect(isShowcaseSlug("ab")).toBe(false);
    expect(isShowcaseSlug("a".repeat(33))).toBe(false);
    expect(isShowcaseSlug("-anna")).toBe(false);
    expect(isShowcaseSlug("Anna")).toBe(false);
    expect(isShowcaseSlug("anna_fit")).toBe(false);
    expect(isShowcaseSlug("анна")).toBe(false);
    expect(isShowcaseSlug(null)).toBe(false);
  });

  it("stores what was typed in lower case without spaces around it", () => {
    expect(normalizeSlug("  Anna-Fit ")).toBe("anna-fit");
  });

  it("builds the page, web and Telegram addresses", () => {
    expect(showcasePath("anna")).toBe("/trainers/anna");
    expect(showcaseUrl("anna", "https://dafit.example")).toBe("https://dafit.example/trainers/anna");
    expect(showcaseTelegram("anna", "fitconnection_bot")).toBe("https://t.me/fitconnection_bot?startapp=tp_anna");
  });
});
