import { describe, expect, it } from "vitest";
import { HEALTH_NOTICE_VERSION, isHealthNoticeSeen } from "./notice";

describe("health notice", () => {
  it("counts as seen only for the version in force", () => {
    expect(isHealthNoticeSeen(HEALTH_NOTICE_VERSION)).toBe(true);
    expect(isHealthNoticeSeen("2020-01-01")).toBe(false);
    expect(isHealthNoticeSeen(undefined)).toBe(false);
  });
});
