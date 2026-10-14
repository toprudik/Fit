// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { themeInitScript } from "./init-script";
import { isColorDark, parseThemePreference, resolveTheme, TELEGRAM_SCHEME_KEY, THEME_COOKIE, type Theme } from "./theme";

/** Runs the exact string the root layout inlines in <head> and returns what it set. */
function runScript(): string | null {
  new Function(themeInitScript)();
  return document.documentElement.getAttribute("data-theme");
}

function setSystemLight(light: boolean | null) {
  const matchMedia =
    light === null
      ? undefined
      : (query: string) => ({ matches: light && query === "(prefers-color-scheme: light)", media: query }) as MediaQueryList;
  Object.defineProperty(window, "matchMedia", { configurable: true, writable: true, value: matchMedia });
}

function setThemeCookie(value: string | null) {
  document.cookie = value === null ? `${THEME_COOKIE}=; Path=/; Max-Age=0` : `${THEME_COOKIE}=${value}; Path=/`;
}

/** A launch hash shaped like the one Telegram opens Mini Apps with. */
function setTelegramLaunch(themeParams: Record<string, string> | string | null) {
  if (themeParams === null) {
    history.replaceState(null, "", "/");
    return;
  }
  const params = new URLSearchParams({
    tgWebAppData: "query_id=AAH&user=%7B%22id%22%3A1%7D&auth_date=1&hash=abc",
    tgWebAppVersion: "8.0",
    tgWebAppPlatform: "ios",
    tgWebAppThemeParams: typeof themeParams === "string" ? themeParams : JSON.stringify(themeParams),
  });
  history.replaceState(null, "", `/#${params}`);
}

const DARK_BG = { bg_color: "#17212b", text_color: "#f5f5f5" };
const LIGHT_BG = { bg_color: "#ffffff", text_color: "#000000" };

beforeEach(() => {
  setThemeCookie(null);
  setTelegramLaunch(null);
  setSystemLight(false);
  sessionStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

afterEach(() => {
  setThemeCookie(null);
  setTelegramLaunch(null);
});

describe("themeInitScript", () => {
  it("uses a pinned theme from the cookie over Telegram and the system", () => {
    setThemeCookie("light");
    setTelegramLaunch(DARK_BG);
    setSystemLight(false);
    expect(runScript()).toBe("light");

    setThemeCookie("dark");
    setTelegramLaunch(LIGHT_BG);
    setSystemLight(true);
    expect(runScript()).toBe("dark");
  });

  it("reads only its own cookie", () => {
    document.cookie = `x${THEME_COOKIE}=light; Path=/`;
    expect(runScript()).toBe("dark");
    document.cookie = `x${THEME_COOKIE}=; Path=/; Max-Age=0`;
  });

  it.each(["system", "sepia", ""])("follows Telegram and the system when the cookie says %j", (value) => {
    setThemeCookie(value);
    setSystemLight(true);
    expect(runScript()).toBe("light");
  });

  it("takes Telegram's scheme from bg_color in the launch hash and keeps it for reloads", () => {
    setTelegramLaunch(DARK_BG);
    setSystemLight(true);
    expect(runScript()).toBe("dark");
    expect(sessionStorage.getItem(TELEGRAM_SCHEME_KEY)).toBe("dark");

    setTelegramLaunch(LIGHT_BG);
    setSystemLight(false);
    expect(runScript()).toBe("light");
    expect(sessionStorage.getItem(TELEGRAM_SCHEME_KEY)).toBe("light");
  });

  it("prefers the launch hash over the scheme saved earlier in the session", () => {
    sessionStorage.setItem(TELEGRAM_SCHEME_KEY, "light");
    setTelegramLaunch(DARK_BG);
    expect(runScript()).toBe("dark");
  });

  it("uses the saved Telegram scheme once the launch hash is gone", () => {
    sessionStorage.setItem(TELEGRAM_SCHEME_KEY, "light");
    setSystemLight(false);
    expect(runScript()).toBe("light");
  });

  it("ignores a saved Telegram scheme it does not know", () => {
    sessionStorage.setItem(TELEGRAM_SCHEME_KEY, "sepia");
    setSystemLight(true);
    expect(runScript()).toBe("light");
  });

  it.each([
    ["no bg_color", { text_color: "#000000" }],
    ["a named color", { bg_color: "white" }],
    ["a short hex", { bg_color: "#fff" }],
    ["broken JSON", "{bg_color:"],
  ])("falls back to the system for %s", (_, themeParams) => {
    setTelegramLaunch(themeParams);
    setSystemLight(true);
    expect(runScript()).toBe("light");
    expect(sessionStorage.getItem(TELEGRAM_SCHEME_KEY)).toBeNull();
  });

  it("follows prefers-color-scheme outside Telegram", () => {
    setSystemLight(true);
    expect(runScript()).toBe("light");
    setSystemLight(false);
    expect(runScript()).toBe("dark");
  });

  it("defaults to dark without matchMedia", () => {
    setSystemLight(null);
    expect(runScript()).toBe("dark");
  });

  it("still sets a theme when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    setSystemLight(true);
    expect(runScript()).toBe("light");

    // Telegram's scheme still applies; only remembering it for reloads fails.
    setTelegramLaunch(LIGHT_BG);
    setSystemLight(false);
    expect(runScript()).toBe("light");
  });

  it("never throws", () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: () => {
        throw new Error("boom");
      },
    });
    expect(() => runScript()).not.toThrow();
  });

  it("uses the same brightness rule as isColorDark", () => {
    for (const color of ["#000000", "#17212b", "#212121", "#777777", "#797979", "#aaaaaa", "#f2f3f5", "#ffffff", "#3d63ff"]) {
      sessionStorage.clear();
      setTelegramLaunch({ bg_color: color });
      expect(runScript(), color).toBe(isColorDark(color) ? "dark" : "light");
    }
  });

  // The script is a hand-written copy of resolveTheme(); this keeps the two in step.
  describe("agrees with resolveTheme", () => {
    const cookies = [null, "system", "light", "dark"] as const;
    const telegrams = [null, "light", "dark"] as const;
    const cases = cookies.flatMap((cookie) =>
      telegrams.flatMap((telegram) => [false, true].map((systemLight) => ({ cookie, telegram, systemLight }))),
    );

    it.each(cases)("%j", ({ cookie, telegram, systemLight }) => {
      setThemeCookie(cookie);
      setTelegramLaunch(telegram === null ? null : telegram === "dark" ? DARK_BG : LIGHT_BG);
      setSystemLight(systemLight);
      const expected: Theme = resolveTheme(parseThemePreference(cookie), { telegram, systemLight });
      expect(runScript()).toBe(expected);
    });
  });
});
