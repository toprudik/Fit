import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { safeNext, parseOidcCookie } = await import("./oidc-cookie");

const APP = "https://fit.example";

describe("safeNext", () => {
  it("keeps same-origin paths", () => {
    expect(safeNext("/me?tab=1#x", APP)).toBe("/me?tab=1#x");
  });

  it.each(["//evil.com", "/\\evil.com", "/\t/evil.com", "/%09/evil.com", "https://evil.com/me", "javascript:alert(1)"])(
    "rejects %s",
    (value) => {
      expect(new URL(safeNext(value, APP), APP).origin).toBe(APP);
    },
  );

  it("falls back when empty", () => {
    expect(safeNext(null, APP)).toBe("/me");
  });
});

describe("parseOidcCookie", () => {
  it("rejects malformed cookies", () => {
    expect(parseOidcCookie("{not json")).toBeNull();
    expect(parseOidcCookie(JSON.stringify({ state: "x" }))).toBeNull();
    expect(parseOidcCookie(undefined)).toBeNull();
  });
});
