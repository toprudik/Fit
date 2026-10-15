import { describe, expect, it } from "vitest";
import {
  isColorDark,
  isThemePreference,
  parseThemePreference,
  resolveTheme,
  TELEGRAM_SCHEME_KEY,
  THEME_COOKIE,
  THEME_PREFERENCES,
  type Theme,
} from "./theme";

describe("theme preference", () => {
  it("is system, light or dark, saved in dafit-theme", () => {
    expect(THEME_PREFERENCES).toEqual(["system", "light", "dark"]);
    expect(THEME_COOKIE).toBe("dafit-theme");
    expect(TELEGRAM_SCHEME_KEY).toBe("dafit-tg-scheme");
  });

  it.each([
    ["system", true],
    ["light", true],
    ["dark", true],
    ["auto", false],
    ["Light", false],
    ["", false],
    [null, false],
    [undefined, false],
  ])("isThemePreference(%j) is %s", (value, expected) => {
    expect(isThemePreference(value)).toBe(expected);
  });

  it("parses a saved value and falls back to system", () => {
    expect(parseThemePreference("light")).toBe("light");
    expect(parseThemePreference("dark")).toBe("dark");
    expect(parseThemePreference("system")).toBe("system");
    expect(parseThemePreference("sepia")).toBe("system");
    expect(parseThemePreference(null)).toBe("system");
    expect(parseThemePreference(undefined)).toBe("system");
  });
});

describe("resolveTheme", () => {
  const contexts: { telegram: Theme | null; systemLight: boolean }[] = [
    { telegram: null, systemLight: false },
    { telegram: null, systemLight: true },
    { telegram: "light", systemLight: false },
    { telegram: "dark", systemLight: true },
  ];

  it.each(contexts)("a pinned theme wins (%j)", (context) => {
    expect(resolveTheme("light", context)).toBe("light");
    expect(resolveTheme("dark", context)).toBe("dark");
  });

  it("follows Telegram's scheme inside the Mini App, whatever the system says", () => {
    expect(resolveTheme("system", { telegram: "light", systemLight: false })).toBe("light");
    expect(resolveTheme("system", { telegram: "dark", systemLight: true })).toBe("dark");
  });

  it("follows the system outside Telegram, dark unless it asks for light", () => {
    expect(resolveTheme("system", { telegram: null, systemLight: true })).toBe("light");
    expect(resolveTheme("system", { telegram: null, systemLight: false })).toBe("dark");
  });
});

describe("isColorDark", () => {
  it.each([
    ["#000000", true],
    ["#17212b", true], // Telegram Desktop night
    ["#212121", true], // Telegram Android dark
    ["#18222d", true], // Telegram iOS night
    ["#ffffff", false],
    ["#f2f3f5", false],
    ["#efeff3", false], // Telegram iOS secondary light
    ["#797979", false], // brightness 121, just over the threshold of 120
    ["#777777", true],
    ["FFFFFF", false],
    ["  #000000  ", true],
  ])("%s → %s", (color, expected) => {
    expect(isColorDark(color)).toBe(expected);
  });

  it.each(["", "#fff", "#0000000", "black", "rgb(0, 0, 0)", "#gggggg"])("cannot tell for %j", (color) => {
    expect(isColorDark(color)).toBeNull();
  });
});
