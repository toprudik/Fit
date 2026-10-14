// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { createElement } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readCookie } from "@/lib/preferences";
import { resetThemeStoreForTests, setTelegramScheme, setThemePreference, useTheme } from "./store";
import { TELEGRAM_SCHEME_KEY, THEME_COOKIE } from "./theme";

const LIGHT_QUERY = "(prefers-color-scheme: light)";

/** A controllable prefers-color-scheme, like the OS switching between light and dark. */
function mockSystem(light: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const media = {
    matches: light,
    media: LIGHT_QUERY,
    addEventListener: vi.fn((_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.add(listener)),
    removeEventListener: vi.fn((_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener)),
  };
  Object.defineProperty(window, "matchMedia", { configurable: true, writable: true, value: vi.fn(() => media) });
  return {
    media,
    listeners,
    switchTo(next: boolean) {
      media.matches = next;
      act(() => {
        for (const listener of listeners) listener({ matches: next, media: LIGHT_QUERY } as MediaQueryListEvent);
      });
    },
  };
}

const savedPreference = () => readCookie(document.cookie, THEME_COOKIE);
const dataTheme = () => document.documentElement.getAttribute("data-theme");

beforeEach(() => {
  document.cookie = `${THEME_COOKIE}=; Path=/; Max-Age=0`;
  sessionStorage.clear();
  document.documentElement.setAttribute("data-theme", "dark");
  resetThemeStoreForTests();
});

afterEach(() => {
  cleanup();
  resetThemeStoreForTests();
});

describe("useTheme", () => {
  it("starts from the saved preference", () => {
    mockSystem(false);
    document.cookie = `${THEME_COOKIE}=light; Path=/`;
    const { result } = renderHook(() => useTheme());
    expect(result.current).toEqual({ preference: "light", theme: "light" });
  });

  it("follows the system when nothing is saved", () => {
    mockSystem(true);
    expect(renderHook(() => useTheme()).result.current).toEqual({ preference: "system", theme: "light" });
  });

  it("is dark by default", () => {
    mockSystem(false);
    expect(renderHook(() => useTheme()).result.current).toEqual({ preference: "system", theme: "dark" });
  });

  it("treats a broken cookie as system", () => {
    mockSystem(true);
    document.cookie = `${THEME_COOKIE}=sepia; Path=/`;
    expect(renderHook(() => useTheme()).result.current).toEqual({ preference: "system", theme: "light" });
  });

  it("uses the Telegram scheme saved this session over the system", () => {
    mockSystem(false);
    sessionStorage.setItem(TELEGRAM_SCHEME_KEY, "light");
    expect(renderHook(() => useTheme()).result.current.theme).toBe("light");
  });
});

describe("setThemePreference", () => {
  it("saves the choice, applies it to <html> and re-renders", () => {
    mockSystem(false);
    const { result } = renderHook(() => useTheme());

    act(() => setThemePreference("light"));
    expect(result.current).toEqual({ preference: "light", theme: "light" });
    expect(dataTheme()).toBe("light");
    expect(savedPreference()).toBe("light");

    act(() => setThemePreference("dark"));
    expect(result.current).toEqual({ preference: "dark", theme: "dark" });
    expect(dataTheme()).toBe("dark");
    expect(savedPreference()).toBe("dark");
  });

  it("goes back to the system theme on system", () => {
    mockSystem(true);
    document.cookie = `${THEME_COOKIE}=dark; Path=/`;
    const { result } = renderHook(() => useTheme());

    act(() => setThemePreference("system"));
    expect(result.current).toEqual({ preference: "system", theme: "light" });
    expect(dataTheme()).toBe("light");
    expect(savedPreference()).toBe("system");
  });

  it("works before any component subscribed", () => {
    mockSystem(false);
    setThemePreference("light");
    expect(dataTheme()).toBe("light");
    expect(renderHook(() => useTheme()).result.current.theme).toBe("light");
  });
});

describe("system changes", () => {
  it("are followed live on system", () => {
    const system = mockSystem(false);
    const { result } = renderHook(() => useTheme());

    system.switchTo(true);
    expect(result.current.theme).toBe("light");
    expect(dataTheme()).toBe("light");

    system.switchTo(false);
    expect(result.current.theme).toBe("dark");
    expect(dataTheme()).toBe("dark");
  });

  it("do not override a pinned theme", () => {
    const system = mockSystem(false);
    document.cookie = `${THEME_COOKIE}=dark; Path=/`;
    const { result } = renderHook(() => useTheme());

    system.switchTo(true);
    expect(result.current).toEqual({ preference: "dark", theme: "dark" });
  });

  it("are listened to once, and not after the last component unmounts", () => {
    const system = mockSystem(false);
    const first = renderHook(() => useTheme());
    const second = renderHook(() => useTheme());
    expect(system.media.addEventListener).toHaveBeenCalledTimes(1);

    first.unmount();
    expect(system.listeners.size).toBe(1);
    second.unmount();
    expect(system.media.removeEventListener).toHaveBeenCalledTimes(1);
    expect(system.listeners.size).toBe(0);
  });
});

describe("setTelegramScheme", () => {
  it("applies Telegram's scheme on system and remembers it for reloads", () => {
    mockSystem(false);
    const { result } = renderHook(() => useTheme());

    act(() => setTelegramScheme("light"));
    expect(result.current.theme).toBe("light");
    expect(dataTheme()).toBe("light");
    expect(sessionStorage.getItem(TELEGRAM_SCHEME_KEY)).toBe("light");
  });

  it("does not override a pinned theme", () => {
    mockSystem(false);
    document.cookie = `${THEME_COOKIE}=dark; Path=/`;
    const { result } = renderHook(() => useTheme());

    act(() => setTelegramScheme("light"));
    expect(result.current.theme).toBe("dark");
  });

  it("falls back to the system outside Telegram", () => {
    mockSystem(true);
    const { result } = renderHook(() => useTheme());
    act(() => setTelegramScheme("dark"));
    expect(result.current.theme).toBe("dark");

    act(() => setTelegramScheme(null));
    expect(result.current.theme).toBe("light");
  });

  it("still applies the scheme when storage is blocked", () => {
    mockSystem(false);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    const { result } = renderHook(() => useTheme());

    act(() => setTelegramScheme("light"));
    expect(result.current.theme).toBe("light");
  });
});

describe("server render and hydration", () => {
  function Probe() {
    const { preference, theme } = useTheme();
    return createElement("span", null, `${preference}/${theme}`);
  }

  it("renders the defaults on the server, whatever the browser has saved", () => {
    mockSystem(true);
    document.cookie = `${THEME_COOKIE}=light; Path=/`;
    expect(renderToString(createElement(Probe))).toBe("<span>system/dark</span>");
  });

  it("hydrates without a mismatch, then shows the saved theme", async () => {
    mockSystem(false);
    const container = document.createElement("div");
    container.innerHTML = renderToString(createElement(Probe));
    document.body.append(container);
    document.cookie = `${THEME_COOKIE}=light; Path=/`;

    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const recoverable = vi.fn();
    const root = await act(async () => hydrateRoot(container, createElement(Probe), { onRecoverableError: recoverable }));

    expect(container.textContent).toBe("light/light");
    expect(recoverable).not.toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();
    act(() => root.unmount());
    container.remove();
  });
});
