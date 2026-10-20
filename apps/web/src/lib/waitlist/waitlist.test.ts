import { describe, expect, it } from "vitest";
import { isClientCount, waitlistSource } from "./waitlist";

describe("waitlistSource", () => {
  it("takes ?src= first, then utm_source", () => {
    expect(waitlistSource({ src: "ch_vk", utm_source: "telegram" })).toBe("ch_vk");
    expect(waitlistSource({ utm_source: "telegram" })).toBe("telegram");
  });

  it("leaves out a label in another shape", () => {
    expect(waitlistSource({ src: "vk post!" })).toBeNull();
    expect(waitlistSource({ src: "x".repeat(65) })).toBeNull();
    expect(waitlistSource({})).toBeNull();
  });

  it("reads the first of repeated parameters", () => {
    expect(waitlistSource({ src: ["ch_tg", "ch_vk"] })).toBe("ch_tg");
  });
});

describe("isClientCount", () => {
  it("knows the four answers", () => {
    expect(isClientCount("6_15")).toBe(true);
    expect(isClientCount("many")).toBe(false);
    expect(isClientCount(null)).toBe(false);
  });
});
