import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { blockedCookieValue, parseBlockedCookie } = await import("./blocked-cookie");

describe("blocked cookie", () => {
  it("carries the admin's reason, any text, and back", () => {
    const reason = "Спам в отзывах; 3 жалобы = блок";
    const value = blockedCookieValue(reason);
    expect(value).toMatch(/^[\w-]+$/);
    expect(parseBlockedCookie(value)).toBe(reason);
  });

  it("tells a block without a reason from no cookie", () => {
    expect(parseBlockedCookie(blockedCookieValue(null))).toBeNull();
    expect(parseBlockedCookie(undefined)).toBeUndefined();
  });

  it("never gives back more than a reason can hold", () => {
    expect(parseBlockedCookie(blockedCookieValue("a".repeat(900)))).toHaveLength(500);
  });
});
