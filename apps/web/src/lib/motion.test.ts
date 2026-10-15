import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { THEME_BG } from "./theme/colors";
import { DURATION, EASE_EXIT, EASE_OVERSHOOT, EASE_STANDARD } from "./motion";

type Token = { name: string; value: unknown };
const tokens = JSON.parse(readFileSync(join(__dirname, "../../../../docs/design/tokens.json"), "utf8")) as Record<
  string,
  { tokens: Token[] }
>;
const value = (section: string, name: string) => tokens[section].tokens.find((token) => token.name === name)?.value;
const bezier = (points: readonly number[]) => `cubic-bezier(${points.join(", ")})`;

describe("JS copies of design tokens", () => {
  it("motion durations match tokens.json", () => {
    for (const [key, seconds] of Object.entries(DURATION)) {
      expect(`${Math.round(seconds * 1000)}ms`, key).toBe(value("duration", `duration-${key}`));
    }
  });

  it("motion easings match tokens.json", () => {
    expect(bezier(EASE_STANDARD)).toBe(value("easing", "easing-standard"));
    expect(bezier(EASE_EXIT)).toBe(value("easing", "easing-exit"));
    expect(bezier(EASE_OVERSHOOT)).toBe(value("easing", "easing-overshoot"));
  });

  it("theme backgrounds match the bg token, as six-digit hex", () => {
    const bg = tokens.color.tokens.find((token) => token.name === "bg")?.value as Record<string, string>;
    expect(THEME_BG).toEqual({ dark: bg.dark, light: bg.light });
    for (const color of Object.values(THEME_BG)) expect(color).toMatch(/^#[0-9a-f]{6}$/);
  });
});
