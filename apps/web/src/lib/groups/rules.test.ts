import { describe, expect, it } from "vitest";
import { BROADCAST_MAX, isButtonUrl, isGroupColor, parseBroadcast } from "./rules";

describe("isButtonUrl", () => {
  it("takes https addresses only", () => {
    expect(isButtonUrl("https://example.com/plan")).toBe(true);
    expect(isButtonUrl("http://example.com")).toBe(false);
    expect(isButtonUrl("javascript:alert(1)")).toBe(false);
    expect(isButtonUrl("https://example.com/a b")).toBe(false);
    expect(isButtonUrl(`https://example.com/${"a".repeat(500)}`)).toBe(false);
  });
});

describe("parseBroadcast", () => {
  it("trims the text and keeps the button", () => {
    expect(parseBroadcast("  Завтра в 10  ", { kind: "deep_link" })).toEqual({ body: "Завтра в 10", button: { kind: "deep_link" } });
    expect(parseBroadcast("Plan", { kind: "url", url: " https://example.com " })).toEqual({
      body: "Plan",
      button: { kind: "url", url: "https://example.com" },
    });
  });

  it("names the wrong field", () => {
    expect(parseBroadcast("   ", { kind: "none" })).toEqual({ error: "body" });
    expect(parseBroadcast("a".repeat(BROADCAST_MAX + 1), { kind: "none" })).toEqual({ error: "body" });
    expect(parseBroadcast("Hi", { kind: "url", url: "http://example.com" })).toEqual({ error: "url" });
  });
});

describe("isGroupColor", () => {
  it("knows the palette", () => {
    expect(isGroupColor("#2F6BFF")).toBe(true);
    expect(isGroupColor("#000000")).toBe(false);
  });
});
