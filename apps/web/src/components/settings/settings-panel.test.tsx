// @vitest-environment jsdom
import { act, fireEvent, screen, within } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/i18n/client";
import { LOCALE_COOKIE } from "@/i18n/config";
import { readCookie } from "@/lib/preferences";
import { resetThemeStoreForTests } from "@/lib/theme/store";
import { THEME_COOKIE } from "@/lib/theme/theme";
import { renderWithProviders } from "@/test/render";
import { SettingsPanel } from "./settings-panel";

const LIGHT_QUERY = "(prefers-color-scheme: light)";

/** A controllable prefers-color-scheme, like the OS switching between light and dark. */
function mockSystem(light: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const media = {
    matches: light,
    media: LIGHT_QUERY,
    addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener),
  };
  Object.defineProperty(window, "matchMedia", { configurable: true, writable: true, value: vi.fn(() => media) });
  return {
    switchTo(next: boolean) {
      media.matches = next;
      act(() => {
        for (const listener of listeners) listener({ matches: next, media: LIGHT_QUERY } as MediaQueryListEvent);
      });
    },
  };
}

/** switchLocale() reloads the page; jsdom can't, so the test only records that it asked to. */
function mockReload() {
  const reload = vi.fn();
  vi.stubGlobal("location", { protocol: "http:", reload });
  return reload;
}

const dataTheme = () => document.documentElement.getAttribute("data-theme");
const cookie = (name: string) => readCookie(document.cookie, name);
const group = (name: string) => screen.getByRole("radiogroup", { name });
const checkedIn = (radiogroup: HTMLElement) =>
  within(radiogroup)
    .getAllByRole("radio")
    .filter((radio) => radio.getAttribute("aria-checked") === "true")
    .map((radio) => radio.textContent);

beforeEach(() => {
  for (const name of [THEME_COOKIE, LOCALE_COOKIE]) document.cookie = `${name}=; Path=/; Max-Age=0`;
  sessionStorage.clear();
  document.documentElement.setAttribute("data-theme", "dark");
  resetThemeStoreForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetThemeStoreForTests();
});

describe("theme", () => {
  it("shows the saved choice", () => {
    mockSystem(false);
    document.cookie = `${THEME_COOKIE}=light; Path=/`;
    renderWithProviders(<SettingsPanel />);

    expect(screen.getByRole("heading", { level: 2, name: "Тема" })).toBeTruthy();
    expect(checkedIn(group("Тема"))).toEqual(["Светлая"]);
    expect(screen.getByText("Авто берёт тему из Telegram, а на сайте из настроек устройства.")).toBeTruthy();
  });

  it("Светлая pins the light theme", () => {
    mockSystem(false);
    renderWithProviders(<SettingsPanel />);

    fireEvent.click(screen.getByRole("radio", { name: "Светлая" }));

    expect(dataTheme()).toBe("light");
    expect(cookie(THEME_COOKIE)).toBe("light");
    expect(checkedIn(group("Тема"))).toEqual(["Светлая"]);
  });

  it("Тёмная pins the dark theme, even on a light system", () => {
    mockSystem(true);
    renderWithProviders(<SettingsPanel />);
    expect(dataTheme()).toBe("dark");

    fireEvent.click(screen.getByRole("radio", { name: "Тёмная" }));

    expect(dataTheme()).toBe("dark");
    expect(cookie(THEME_COOKIE)).toBe("dark");
    expect(checkedIn(group("Тема"))).toEqual(["Тёмная"]);
  });

  it("Авто follows the system, live", () => {
    const system = mockSystem(true);
    document.cookie = `${THEME_COOKIE}=dark; Path=/`;
    renderWithProviders(<SettingsPanel />);

    fireEvent.click(screen.getByRole("radio", { name: "Авто" }));
    expect(dataTheme()).toBe("light");
    expect(cookie(THEME_COOKIE)).toBe("system");

    system.switchTo(false);
    expect(dataTheme()).toBe("dark");
    system.switchTo(true);
    expect(dataTheme()).toBe("light");
  });

  it("hydrates over the server's default without a mismatch, then shows the saved choice", async () => {
    mockSystem(false);
    const ui = (
      <I18nProvider locale="ru">
        <SettingsPanel />
      </I18nProvider>
    );
    const container = document.createElement("div");
    container.innerHTML = renderToString(ui);
    document.body.append(container);
    // The prerendered page can't know the cookie: it ships "system".
    expect(container.querySelector('[aria-checked="true"]')?.textContent).toBe("Авто");
    document.cookie = `${THEME_COOKIE}=light; Path=/`;

    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const recoverable = vi.fn();
    const root = await act(async () => hydrateRoot(container, ui, { onRecoverableError: recoverable }));

    expect(checkedIn(within(container).getByRole("radiogroup", { name: "Тема" }))).toEqual(["Светлая"]);
    expect(recoverable).not.toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();
    act(() => root.unmount());
    container.remove();
  });
});

describe("language", () => {
  it("shows the current language", () => {
    mockSystem(false);
    renderWithProviders(<SettingsPanel />);

    expect(screen.getByRole("heading", { level: 2, name: "Язык" })).toBeTruthy();
    expect(within(group("Язык")).getAllByRole("radio").map((radio) => radio.textContent)).toEqual(["Русский", "English"]);
    expect(checkedIn(group("Язык"))).toEqual(["Русский"]);
  });

  it("English saves the choice and reloads the page", () => {
    mockSystem(false);
    const reload = mockReload();
    renderWithProviders(<SettingsPanel />);

    fireEvent.click(screen.getByRole("radio", { name: "English" }));

    expect(cookie(LOCALE_COOKIE)).toBe("en");
    expect(reload).toHaveBeenCalledOnce();
  });

  it("does nothing when the current language is chosen again", () => {
    mockSystem(false);
    const reload = mockReload();
    renderWithProviders(<SettingsPanel />);

    fireEvent.click(screen.getByRole("radio", { name: "Русский" }));

    expect(cookie(LOCALE_COOKIE)).toBeNull();
    expect(reload).not.toHaveBeenCalled();
  });
});

describe("in English", () => {
  it("renders the English catalog with English selected", () => {
    mockSystem(false);
    renderWithProviders(<SettingsPanel />, { locale: "en" });

    expect(screen.getByRole("heading", { level: 2, name: "Theme" })).toBeTruthy();
    expect(within(group("Theme")).getAllByRole("radio").map((radio) => radio.textContent)).toEqual(["Auto", "Light", "Dark"]);
    expect(screen.getByText("Auto follows Telegram, or your device settings on the website.")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "Language" })).toBeTruthy();
    expect(checkedIn(group("Language"))).toEqual(["English"]);
  });

  it("switches back to Russian", () => {
    mockSystem(false);
    const reload = mockReload();
    renderWithProviders(<SettingsPanel />, { locale: "en" });

    fireEvent.click(screen.getByRole("radio", { name: "Русский" }));

    expect(cookie(LOCALE_COOKIE)).toBe("ru");
    expect(reload).toHaveBeenCalledOnce();
  });
});
