import { describe, expect, it } from "vitest";
import { calculatorCtaHref, isClientCount, waitlistSource } from "./waitlist";

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

describe("calculatorCtaHref", () => {
  it("carries the visit's label on to the waitlist, or the calculator's own", () => {
    expect(calculatorCtaHref("ch_vk")).toBe("/for-trainers?src=ch_vk#waitlist");
    expect(calculatorCtaHref(null)).toBe("/for-trainers?src=price_calc#waitlist");
  });
});
