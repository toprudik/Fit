import { describe, expect, it } from "vitest";
import { currencySymbol, formatMoney, majorText, parseMajor } from "./format";

describe("money format", () => {
  it("formats minor units in the viewer's language", () => {
    expect(formatMoney("ru", 150000, "RUB").replace(/\s/g, " ")).toBe("1 500 ₽");
    expect(formatMoney("en", 150050, "USD")).toBe("$1,500.50");
  });

  it("names the currency symbol", () => {
    expect(currencySymbol("ru", "RUB")).toBe("₽");
    expect(currencySymbol("en", "EUR")).toBe("€");
  });

  it("reads a typed price as minor units", () => {
    expect(parseMajor("1 500")).toBe(150000);
    expect(parseMajor("1500,5")).toBe(150050);
    expect(parseMajor("0")).toBe(0);
    expect(parseMajor("")).toBeNull();
    expect(parseMajor("-5")).toBeNull();
    expect(parseMajor("1.234")).toBeNull();
    expect(parseMajor("abc")).toBeNull();
    expect(parseMajor("99999999")).toBeNull();
  });

  it("shows minor units back as a plain number", () => {
    expect(majorText(150050)).toBe("1500.5");
  });
});
