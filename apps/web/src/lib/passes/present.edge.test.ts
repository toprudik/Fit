import { describe, expect, it } from "vitest";
import { localInstant } from "./present";

describe("localInstant across a clock change", () => {
  it("uses the offset before the spring change in Berlin", () => {
    expect(localInstant("2026-03-29", "01:30", "Europe/Berlin")).toBe("2026-03-29T00:30:00.000Z");
  });

  it("uses the offset after the spring change in New York", () => {
    expect(localInstant("2026-03-08", "05:00", "America/New_York")).toBe("2026-03-08T09:00:00.000Z");
  });
});
