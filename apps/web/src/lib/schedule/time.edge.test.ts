import { describe, expect, it } from "vitest";
import { localToUtc } from "./time";

describe("localToUtc across a clock change", () => {
  it("uses the offset before the spring change in Berlin", () => {
    expect(localToUtc("2026-03-29", 90, "Europe/Berlin").toISOString()).toBe("2026-03-29T00:30:00.000Z");
  });

  it("uses the offset after the spring change in New York", () => {
    expect(localToUtc("2026-03-08", 300, "America/New_York").toISOString()).toBe("2026-03-08T09:00:00.000Z");
  });
});
