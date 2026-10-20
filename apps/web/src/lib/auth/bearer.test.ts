import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { hasBearer } = await import("./bearer");

const SECRET = "invented-secret-for-tests-0123456789";

describe("hasBearer", () => {
  it("accepts exactly the Bearer header", () => {
    expect(hasBearer(`Bearer ${SECRET}`, SECRET)).toBe(true);
  });

  it.each([null, "", SECRET, `bearer ${SECRET}`, `Bearer ${SECRET} `, `Bearer ${SECRET}x`, `Bearer ${SECRET.slice(0, -1)}`, "Bearer "])(
    "refuses %j",
    (header) => {
      expect(hasBearer(header, SECRET)).toBe(false);
    },
  );

  it("never matches an unset or empty secret, not even an empty Bearer", () => {
    expect(hasBearer("Bearer ", "")).toBe(false);
    expect(hasBearer("Bearer undefined", undefined)).toBe(false);
  });

  it("compares digests with timingSafeEqual, never with ===", () => {
    const source = readFileSync(new URL("./bearer.ts", import.meta.url), "utf8");
    expect(source).toContain("timingSafeEqual(digest(");
    expect(source).not.toMatch(/===\s*`Bearer/);
  });
});
