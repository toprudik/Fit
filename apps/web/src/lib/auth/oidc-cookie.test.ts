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
    expect(safeNext(null, APP)).toBe("/");
  });

  // Inside the Mini App /login goes on to `next` once signed in: a crafted one must not reach the
  // OIDC flow (oauth.telegram.org does not load there), an API route or /login itself.
  it.each([
    "/auth/telegram/login",
    "/auth/sign-out",
    "/api/auth/telegram/mini-app",
    "/login",
    "/login/",
    "/login?next=%2Fclient",
    "/%61uth/telegram/login",
    "/x/../auth/telegram/login",
    "https://fit.example/auth/telegram/login?next=%2F",
  ])("sends %s to the start", (value) => {
    expect(safeNext(value, APP)).toBe("/");
  });

  it("keeps screens whose names only start like those paths", () => {
    expect(safeNext("/login-help", APP)).toBe("/login-help");
    expect(safeNext("/client/authors", APP)).toBe("/client/authors");
  });
});

describe("parseOidcCookie", () => {
  it("rejects malformed cookies", () => {
    expect(parseOidcCookie("{not json")).toBeNull();
    expect(parseOidcCookie(JSON.stringify({ state: "x" }))).toBeNull();
    expect(parseOidcCookie(undefined)).toBeNull();
  });
});
