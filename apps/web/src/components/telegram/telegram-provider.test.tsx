// @vitest-environment jsdom
import { act, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LOCALE_COOKIE } from "@/i18n/config";
import { resetMiniAppForTests, signInToMiniApp, useInTelegram, useMiniAppSignIn } from "@/lib/telegram/mini-app";
import { THEME_BG } from "@/lib/theme/colors";
import { resetThemeStoreForTests, setThemePreference } from "@/lib/theme/store";
import { ThemeSync } from "@/lib/theme/theme-sync";
import { TELEGRAM_SCHEME_KEY, THEME_COOKIE } from "@/lib/theme/theme";
import { renderWithProviders } from "@/test/render";
import { TelegramProvider } from "./telegram-provider";

const sdk = vi.hoisted(() => {
  /** Just enough of a tma.js signal: call it to read, `sub` to follow, `set` stands in for Telegram. */
  function signal<T>(initial: T) {
    let value = initial;
    const listeners = new Set<(value: T) => void>();
    return Object.assign(() => value, {
      sub(listener: (value: T) => void) {
        listeners.add(listener);
        return () => void listeners.delete(listener);
      },
      set(next: T) {
        value = next;
        for (const listener of listeners) listener(next);
      },
    });
  }
  let onSettings: (() => void) | null = null;
  return {
    isTMA: vi.fn(() => true),
    init: vi.fn(() => vi.fn()),
    retrieveRawInitData: vi.fn<() => string | undefined>(),
    retrieveLaunchParams: vi.fn<() => { tgWebAppStartParam?: string }>(() => ({})),
    miniApp: { mount: vi.fn(), ready: vi.fn(), setHeaderColor: vi.fn(), setBgColor: vi.fn(), setBottomBarColor: vi.fn() },
    themeParams: { mount: vi.fn(), bgColor: signal<string | undefined>(undefined) },
    backButton: { mount: vi.fn(), show: vi.fn(), hide: vi.fn(), onClick: vi.fn(() => () => {}) },
    settingsButton: {
      mount: vi.fn(),
      show: vi.fn(),
      onClick: vi.fn((listener: () => void) => {
        onSettings = listener;
        return () => {
          onSettings = null;
        };
      }),
      press: () => onSettings?.(),
    },
    swipeBehavior: { mount: vi.fn(), enableVertical: vi.fn(), disableVertical: vi.fn() },
    viewport: { mount: vi.fn(() => Promise.resolve()), expand: vi.fn(), bindCssVars: vi.fn(() => () => {}) },
    hapticFeedback: { impactOccurred: vi.fn(), selectionChanged: vi.fn() },
  };
});
vi.mock("@tma.js/sdk-react", () => sdk);

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const toast = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("@/components/ui/sonner", () => ({ toast }));

// jsdom can't navigate: the reload is counted instead.
const reload = vi.hoisted(() => ({ reloadPage: vi.fn() }));
vi.mock("@/lib/navigation/reload", () => reload);

const DARK_TELEGRAM = "#17212b";
const LIGHT_TELEGRAM = "#ffffff";

const dataTheme = () => document.documentElement.getAttribute("data-theme");
const telegramScheme = () => sessionStorage.getItem(TELEGRAM_SCHEME_KEY);
/** The colors last sent for Telegram's header, background and bottom bar. */
const chrome = () =>
  [sdk.miniApp.setHeaderColor, sdk.miniApp.setBgColor, sdk.miniApp.setBottomBarColor].map((setter) => setter.mock.lastCall?.[0]);

/** A system scheme for "Авто" on the website; inside Telegram it must not matter. */
function systemPrefersLight(light: boolean) {
  const media = { matches: light, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  Object.defineProperty(window, "matchMedia", { configurable: true, writable: true, value: vi.fn(() => media) });
}

let launches = 0;
/** Each test launches with its own initData: the provider sends a given initData once per page load. */
function launch({ bg = DARK_TELEGRAM }: { bg?: string } = {}) {
  launches += 1;
  const initData = `auth_date=1&hash=${launches}`;
  sdk.retrieveRawInitData.mockReturnValue(initData);
  sdk.themeParams.bgColor.set(bg);
  return initData;
}

/**
 * The server's answer. Like the real one, it sets the language cookie when it sends `locale`; the
 * browser keeps it unless `keepsCookies` is false (third-party cookies blocked in Telegram Web).
 */
function signInResponse(body: Record<string, unknown>, ok = true, status = ok ? 200 : 401, { keepsCookies = true } = {}) {
  const fetch = vi.fn(async () => {
    if (keepsCookies && typeof body.locale === "string") document.cookie = `${LOCALE_COOKIE}=${body.locale}; Path=/`;
    return { ok, status, json: async () => body };
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

function Probe() {
  const signIn = useMiniAppSignIn();
  return (
    <>
      <p>{useInTelegram() ? "telegram" : "website"}</p>
      <p>sign-in: {signIn ?? "none"}</p>
    </>
  );
}

const signInStatus = () => screen.getByText(/^sign-in: /).textContent?.replace("sign-in: ", "");

/** As in the root layout: ThemeSync sits next to the provider and starts the theme store first. */
function renderApp(options: { strict?: boolean } = {}) {
  const app = (
    <>
      <TelegramProvider>
        <Probe />
      </TelegramProvider>
      <ThemeSync />
    </>
  );
  return renderWithProviders(options.strict ? <StrictMode>{app}</StrictMode> : app);
}

beforeEach(() => {
  vi.clearAllMocks();
  resetMiniAppForTests();
  document.cookie = `${THEME_COOKIE}=; Path=/; Max-Age=0`;
  document.cookie = `${LOCALE_COOKIE}=; Path=/; Max-Age=0`;
  document.documentElement.removeAttribute("data-telegram");
  sessionStorage.clear();
  sdk.retrieveLaunchParams.mockReturnValue({});
  document.documentElement.setAttribute("data-theme", "dark");
  resetThemeStoreForTests();
  systemPrefersLight(false);
  signInResponse({ ok: true, fresh: false });
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("outside Telegram", () => {
  it("leaves the website as it is", () => {
    sdk.isTMA.mockReturnValue(false);
    renderApp();

    expect(screen.getByText("website")).toBeTruthy();
    expect(signInStatus()).toBe("none");
    expect(sdk.init).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    sdk.isTMA.mockReturnValue(true);
  });

  it("takes back the Telegram mark the pre-paint script set, so /login shows the website's way in", () => {
    document.documentElement.setAttribute("data-telegram", "");
    sdk.isTMA.mockReturnValue(false);
    renderApp();

    expect(document.documentElement.hasAttribute("data-telegram")).toBe(false);
    sdk.isTMA.mockReturnValue(true);
  });

  it("stays the website when the SDK can't read the launch params, with no initData to sign in with", () => {
    launch();
    sdk.init.mockImplementationOnce(() => {
      throw new Error("Unable to retrieve launch parameters");
    });
    renderApp();

    expect(screen.getByText("website")).toBeTruthy();
    expect(signInStatus()).toBe("reopen");
    expect(sdk.miniApp.mount).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("stays the website when initData can't be read", () => {
    launch();
    const cleanup = vi.fn();
    sdk.init.mockReturnValueOnce(cleanup);
    sdk.retrieveRawInitData.mockImplementationOnce(() => {
      throw new Error("Invalid launch params");
    });
    renderApp();

    expect(screen.getByText("website")).toBeTruthy();
    expect(cleanup).toHaveBeenCalledOnce();
    expect(sdk.miniApp.mount).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("inside Telegram", () => {
  it("goes live: components mounted, app marked ready, splash handed over after a frame", async () => {
    launch();
    renderApp();

    expect(screen.getByText("telegram")).toBeTruthy();
    for (const component of [sdk.miniApp, sdk.themeParams, sdk.backButton, sdk.settingsButton, sdk.swipeBehavior]) {
      expect(component.mount).toHaveBeenCalledOnce();
    }
    expect(sdk.viewport.expand).toHaveBeenCalledOnce();
    expect(sdk.viewport.bindCssVars).toHaveBeenCalledOnce();
    await waitFor(() => expect(sdk.miniApp.ready).toHaveBeenCalledOnce());
  });

  it("follows a dark Telegram on Авто even when the system is light", () => {
    systemPrefersLight(true);
    launch({ bg: DARK_TELEGRAM });
    renderApp();

    expect(dataTheme()).toBe("dark");
    expect(telegramScheme()).toBe("dark");
    expect(chrome()).toEqual([THEME_BG.dark, THEME_BG.dark, THEME_BG.dark]);
  });

  it("follows a light Telegram, and theme_changed while it runs", () => {
    launch({ bg: LIGHT_TELEGRAM });
    renderApp();
    expect(dataTheme()).toBe("light");
    expect(chrome()).toEqual([THEME_BG.light, THEME_BG.light, THEME_BG.light]);

    act(() => sdk.themeParams.bgColor.set(DARK_TELEGRAM));

    expect(dataTheme()).toBe("dark");
    expect(telegramScheme()).toBe("dark");
  });

  it("lets a pinned theme win without taking it for Telegram's scheme", async () => {
    launch({ bg: DARK_TELEGRAM });
    renderApp();

    act(() => setThemePreference("light"));
    expect(dataTheme()).toBe("light");
    await waitFor(() => expect(chrome()).toEqual([THEME_BG.light, THEME_BG.light, THEME_BG.light]));
    expect(telegramScheme()).toBe("dark");

    act(() => setThemePreference("system"));
    expect(dataTheme()).toBe("dark");
    await waitFor(() => expect(chrome()).toEqual([THEME_BG.dark, THEME_BG.dark, THEME_BG.dark]));
  });

  it("keeps the scheme it had when Telegram sends no bg_color", () => {
    sessionStorage.setItem(TELEGRAM_SCHEME_KEY, "light");
    launch({ bg: "" });
    sdk.themeParams.bgColor.set(undefined);
    renderApp();

    expect(telegramScheme()).toBe("light");
  });

  it("shows Telegram's Settings item and opens /settings from it", () => {
    launch();
    renderApp();
    expect(sdk.settingsButton.show).toHaveBeenCalledOnce();

    sdk.settingsButton.press();
    expect(router.push).toHaveBeenCalledExactlyOnceWith("/settings");

    window.history.replaceState(null, "", "/settings");
    sdk.settingsButton.press();
    expect(router.push).toHaveBeenCalledOnce();
  });

  it("keeps working when the client lacks a feature", () => {
    launch();
    sdk.settingsButton.show.mockImplementationOnce(() => {
      throw new Error("unsupported in Mini Apps version 6.0");
    });
    sdk.miniApp.setBottomBarColor.mockImplementationOnce(() => {
      throw new Error("unsupported in Mini Apps version 6.0");
    });
    renderApp();

    expect(screen.getByText("telegram")).toBeTruthy();
    expect(sdk.miniApp.setBgColor).toHaveBeenCalledWith(THEME_BG.dark);
  });
  it("opens the screen startapp names, once per tab", () => {
    launch();
    sdk.retrieveLaunchParams.mockReturnValue({ tgWebAppStartParam: "ti_ABCDEFGHJKLM" });
    const { unmount } = renderApp({ strict: true });
    expect(router.replace).toHaveBeenCalledExactlyOnceWith("/onboarding/trainer?code=ABCDEFGHJKLM");

    // A reload keeps the launch params; the invite screen opened already.
    unmount();
    renderApp();
    expect(router.replace).toHaveBeenCalledOnce();
  });

  it("stays put for a startapp it does not know", () => {
    launch();
    sdk.retrieveLaunchParams.mockReturnValue({ tgWebAppStartParam: "zz_1" });
    renderApp();
    expect(router.replace).not.toHaveBeenCalled();
  });
});

describe("sign-in", () => {
  it("sends initData once, even when React runs the effect twice", async () => {
    const initData = launch();
    const fetch = signInResponse({ ok: true, fresh: true });
    renderApp({ strict: true });

    await waitFor(() => expect(router.refresh).toHaveBeenCalledOnce());
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith(
      "/api/auth/telegram/mini-app",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ initData }) }),
    );
  });

  it("leaves the page alone when the session already existed", async () => {
    launch();
    const fetch = signInResponse({ ok: true, fresh: false, locale: "ru" });
    renderApp();

    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(router.refresh).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("says so in a toast when it fails", async () => {
    launch();
    signInResponse({ ok: false }, false);
    renderApp();

    await waitFor(() => expect(toast.error).toHaveBeenCalledExactlyOnceWith("Не удалось войти, открой приложение заново"));
  });

  it("reports signed-in once the server set the session", async () => {
    launch();
    renderApp();

    expect(signInStatus()).toBe("pending");
    await waitFor(() => expect(signInStatus()).toBe("signed-in"));
  });

  it("asks to reopen the app when the server rejects initData as too old", async () => {
    launch();
    signInResponse({ error: "invalid_init_data" }, false, 401);
    renderApp();

    await waitFor(() => expect(signInStatus()).toBe("reopen"));
  });

  it("sends the same initData again when asked after a server error", async () => {
    const initData = launch();
    signInResponse({ error: "sign_in_failed" }, false, 500);
    renderApp();
    await waitFor(() => expect(signInStatus()).toBe("failed"));

    const retry = signInResponse({ ok: true, fresh: true });
    await act(() => signInToMiniApp());

    expect(retry).toHaveBeenCalledExactlyOnceWith("/api/auth/telegram/mini-app", expect.objectContaining({ body: JSON.stringify({ initData }) }));
    expect(signInStatus()).toBe("signed-in");
    expect(router.refresh).toHaveBeenCalledOnce();
  });

  it("asks to reopen the app when the launch has no initData, and sends nothing", () => {
    launch();
    sdk.retrieveRawInitData.mockReturnValue(undefined);
    renderApp();

    expect(screen.getByText("telegram")).toBeTruthy();
    expect(signInStatus()).toBe("reopen");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reloads once to show the language the server picked on the first launch", async () => {
    launch();
    signInResponse({ ok: true, fresh: true, locale: "en" });
    renderApp();

    await waitFor(() => expect(signInStatus()).toBe("signed-in"));
    expect(reload.reloadPage).toHaveBeenCalledOnce();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("asks for the Telegram app, without reloading, when the browser drops the cookies the server set", async () => {
    // Telegram Web with third-party cookies blocked: the session can't last, and a reload for the
    // language would find no language cookie and reload again.
    launch();
    signInResponse({ ok: true, fresh: true, locale: "en" }, true, 200, { keepsCookies: false });
    renderApp();

    await waitFor(() => expect(signInStatus()).toBe("blocked"));
    expect(reload.reloadPage).not.toHaveBeenCalled();
    expect(router.refresh).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledExactlyOnceWith(
      "Браузер не даёт сохранить вход. Открой DaFit в приложении Telegram на телефоне или компьютере.",
    );
  });

  it("notices dropped cookies when the language needs no reload too", async () => {
    launch();
    signInResponse({ ok: true, fresh: true, locale: "ru" }, true, 200, { keepsCookies: false });
    renderApp();

    await waitFor(() => expect(signInStatus()).toBe("blocked"));
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("reloads for the language at most once per tab: after that it stays and asks for the Telegram app", async () => {
    launch();
    signInResponse({ ok: true, fresh: true, locale: "en" });
    const first = renderApp();
    await waitFor(() => expect(reload.reloadPage).toHaveBeenCalledOnce());
    first.unmount();

    // The next page load: the server again got no language cookie, though the browser shows one.
    resetMiniAppForTests();
    launch();
    renderApp();

    await waitFor(() => expect(signInStatus()).toBe("blocked"));
    expect(reload.reloadPage).toHaveBeenCalledOnce();
  });

  it("leaves the toast out on /login, which shows the outcome on the page", async () => {
    window.history.replaceState(null, "", "/login");
    launch();
    signInResponse({ error: "sign_in_failed" }, false, 500);
    renderApp();

    await waitFor(() => expect(signInStatus()).toBe("failed"));
    expect(toast.error).not.toHaveBeenCalled();
  });
});
