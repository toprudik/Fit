"use client";

import {
  backButton,
  closingBehavior,
  init,
  isTMA,
  miniApp,
  retrieveLaunchParams,
  retrieveRawInitData,
  settingsButton,
  swipeBehavior,
  themeParams,
  viewport,
} from "@tma.js/sdk-react";
import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent } from "react";
import { toast } from "@/components/ui/sonner";
import { useI18n } from "@/i18n/client";
import { isLocale, LOCALE_COOKIE, type Locale } from "@/i18n/config";
import { reloadPage } from "@/lib/navigation/reload";
import { readCookie } from "@/lib/preferences";
import { displayModeFor } from "@/lib/telegram/display-mode";
import { startParamPath } from "@/lib/telegram/start-param";
import {
  markMiniAppReady,
  type MiniAppSignInResult,
  safely,
  safelyAsync,
  setMiniAppBlockReason,
  setMiniAppSignIn,
  signInToMiniApp,
  useTelegramVerticalSwipeLock,
} from "@/lib/telegram/mini-app";
import { THEME_BG } from "@/lib/theme/colors";
import { applyThemePreference, setTelegramScheme } from "@/lib/theme/store";
import { isColorDark, isThemePreference } from "@/lib/theme/theme";
import { TelegramBackFallback } from "./back-fallback";

const SETTINGS_HREF = "/settings";
const LOGIN_HREF = "/login";

/**
 * initData already sent this page load. React runs effects twice in development, and a second
 * sign-in would answer `fresh: false` while the first one's answer is thrown away.
 */
const sentInitData = new Set<string>();

/** Set in sessionStorage once this tab reloaded for the language: it never reloads for it again. */
const LOCALE_RELOAD_KEY = "dafit-locale-reload";

/** The startapp parameter this tab already followed: a reload keeps the launch params, not the intent. */
const START_PARAM_KEY = "dafit-start-param";

/**
 * The screen this launch's `startapp` asks for, the first time in this tab; null when there is none,
 * it was followed already, or the app is on that screen.
 */
function takeStartParamPath(): string | null {
  const param = safely(() => retrieveLaunchParams().tgWebAppStartParam);
  const path = startParamPath(param);
  if (!param || !path) return null;
  try {
    if (sessionStorage.getItem(START_PARAM_KEY) === param) return null;
    sessionStorage.setItem(START_PARAM_KEY, param);
  } catch {
    // No sessionStorage: follow it anyway; the check below keeps a reload from navigating in place.
  }
  return path === `${window.location.pathname}${window.location.search}` ? null : path;
}

/** True the first time in this tab, false after that or when sessionStorage is unavailable. */
function takeLocaleReload(): boolean {
  try {
    if (sessionStorage.getItem(LOCALE_RELOAD_KEY)) return false;
    sessionStorage.setItem(LOCALE_RELOAD_KEY, "1");
    return true;
  } catch {
    return false;
  }
}

/**
 * What to do after the server accepted initData. It sends `detected` only when it set the language
 * cookie: on the first launch with the language from Telegram, later with the one saved to the
 * account on another device (ADR 0015). When the browser did not keep that cookie, it drops the
 * app's cookies, as Telegram Web does in its iframe with third-party cookies blocked: no session
 * can last there.
 */
function afterSignIn(detected: Locale | null, rendered: Locale): "stay" | "reload" | "blocked" {
  if (!detected) return "stay";
  if (readCookie(document.cookie, LOCALE_COOKIE) !== detected) return "blocked";
  if (detected === rendered) return "stay";
  // One reload shows the page in that language. If the server still got no cookie after it, the
  // browser keeps the cookie but does not send it: another reload would loop, so stay.
  return takeLocaleReload() ? "reload" : "blocked";
}

/**
 * Paints Telegram's header, background and bottom bar in DaFit's `bg` for the theme on <html>
 * (ADR 0010). The color comes from THEME_BG, never from the CSS: the minifier shortens #000000
 * to #000, and the SDK takes six-digit hex only. The SDK posts only colors that changed.
 */
function paintTelegramChrome() {
  const color = THEME_BG[document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark"];
  safely(() => miniApp.setHeaderColor(color));
  safely(() => miniApp.setBgColor(color));
  safely(() => miniApp.setBottomBarColor(color));
}

/**
 * Hands Telegram's light/dark scheme to the theme store and follows theme_changed live. The scheme
 * comes from Telegram's theme (the brightness of its bg_color, as Telegram clients derive
 * colorScheme), never from miniApp.isDark: that one reflects the colors we paint ourselves.
 */
function followTelegramScheme() {
  const apply = (bg: string | undefined) => {
    const dark = bg ? isColorDark(bg) : null;
    if (dark !== null) setTelegramScheme(dark ? "dark" : "light");
  };
  return safely(() => {
    apply(themeParams.bgColor());
    return themeParams.bgColor.sub(apply);
  });
}

/**
 * Takes the screen: fullscreen on a phone when the client supports it (Mini Apps 8.0+), otherwise
 * the full height. Fullscreen does not wait for the viewport mount, which waits on Telegram's
 * answers; a reload that finds the app in fullscreen already gets ALREADY_FULLSCREEN, which the SDK
 * takes as success. Content keeps clear of Telegram's buttons through --safe-* in globals.css,
 * which add the content safe area to the device's.
 */
function takeScreen() {
  safely(() => viewport.expand());
  const platform = safely(() => retrieveLaunchParams().tgWebAppPlatform);
  if (displayModeFor(platform) === "fullscreen" && safely(() => viewport.requestFullscreen.isAvailable())) {
    void safelyAsync(() => viewport.requestFullscreen());
  }
}

/**
 * Initializes the SDK from the launch params and reads initData. Returns undefined when that fails
 * (launch params the SDK can't parse, no Telegram bridge): the app then stays the website.
 */
function launchMiniApp() {
  return safely(() => {
    const cleanup = init();
    try {
      return { cleanup, rawInitData: retrieveRawInitData() };
    } catch (error) {
      cleanup();
      throw error;
    }
  });
}

/**
 * Inside Telegram: mounts the Mini App SDK, opens fullscreen on a phone and at full height on a
 * computer, keeps vertical swipes off and asks before closing, takes the light/dark scheme and safe
 * areas from Telegram (never its colors), keeps Telegram's chrome in DaFit's background color, routes the
 * Settings item of Telegram's menu to /settings and signs the user in from initData (verified on
 * the server) on every page load. A launch with `startapp` (t.me/<bot>?startapp=ti_…) opens the screen
 * it names, once per tab. After a full page load the URL has no launch hash; the SDK then
 * reads the launch params it saved in sessionStorage (tapps/launchParams) on the first load.
 * Outside Telegram it does nothing; when the SDK can't start, the app stays the website, and
 * /login asks to reopen it. When the browser drops the app's cookies (Telegram Web's iframe with
 * third-party cookies blocked), it asks to use the Telegram app and never reloads in a loop.
 */
export function TelegramProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { locale, t } = useI18n();
  // Telegram's swipe down would pull the whole app down or fold it while the page scrolls: the app stays put.
  useTelegramVerticalSwipeLock(true);

  const openSettings = useEffectEvent(() => {
    if (window.location.pathname !== SETTINGS_HREF) router.push(SETTINGS_HREF);
  });

  const openStartPath = useEffectEvent((path: string) => router.replace(path));

  const signIn = useEffectEvent(async (initData: string): Promise<MiniAppSignInResult> => {
    let result: MiniAppSignInResult = "failed";
    try {
      const res = await fetch("/api/auth/telegram/mini-app", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData }),
      });
      if (res.ok) {
        // Session cookies are httpOnly, so the server decides whether this was a new sign-in.
        const { fresh, locale: detected, theme } = (await res.json()) as { fresh?: boolean; locale?: string; theme?: string };
        // A theme saved to the account, maybe on another device: the server already set the cookie.
        if (isThemePreference(theme)) applyThemePreference(theme);
        const next = afterSignIn(isLocale(detected) ? detected : null, locale);
        if (next === "reload") reloadPage();
        else if (next === "stay" && fresh) router.refresh();
        if (next !== "blocked") return "signed-in";
        result = "blocked";
      } else if (res.status === 401) {
        // initData too old or not genuine. Sending it again won't help, only a new launch will.
        result = "reopen";
      } else if (res.status === 403) {
        const body = (await res.json().catch(() => null)) as { error?: string; reason?: unknown } | null;
        if (body?.error === "account_blocked") {
          // An admin blocked the account; the server ended any session it had, so the screen re-reads who is in.
          // /login shows the admin's reason with it.
          setMiniAppBlockReason(body.reason);
          result = "banned";
          router.refresh();
        }
      }
    } catch {
      // Network or a malformed answer: another try may work.
    }
    // /login shows how the sign-in went on the page itself.
    if (window.location.pathname !== LOGIN_HREF) toast.error(
        result === "blocked" ? t.telegram.cookiesBlocked : result === "banned" ? t.telegram.accountBlocked : t.telegram.signInFailed,
      );
    return result;
  });

  useEffect(() => {
    if (!safely(() => isTMA())) {
      // The pre-paint script took launch params for Telegram, the SDK did not: this is the website.
      document.documentElement.removeAttribute("data-telegram");
      return;
    }
    const launch = launchMiniApp();
    if (!launch) {
      // Inside Telegram, but without launch params there is no initData to sign in with.
      setMiniAppSignIn(null);
      return;
    }
    const disposers: (() => void)[] = [launch.cleanup];
    const keep = (dispose: (() => void) | undefined) => {
      if (dispose) disposers.push(dispose);
    };

    safely(() => miniApp.mount());
    safely(() => themeParams.mount());
    safely(() => backButton.mount());
    safely(() => settingsButton.mount());
    safely(() => swipeBehavior.mount());
    safely(() => closingBehavior.mount());
    // Closing the app (the cross, a swipe) first asks Telegram's own "close anyway?" question.
    safely(() => closingBehavior.enableConfirmation());

    // The scheme first: it may change data-theme, and the chrome is painted from data-theme.
    keep(followTelegramScheme());
    paintTelegramChrome();
    const observer = new MutationObserver(paintTelegramChrome);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    keep(() => observer.disconnect());

    safely(() => settingsButton.show());
    keep(safely(() => settingsButton.onClick(() => openSettings())));

    // Safe-area insets become --tg-viewport-* variables, read by --safe-* in globals.css. They are
    // bound right away and fill in once the mount has asked Telegram for the insets.
    keep(safely(() => viewport.bindCssVars()));
    void safelyAsync(() => viewport.mount());
    takeScreen();

    markMiniAppReady();
    // The screen checks the parameter on the server and waits for the session itself (screens.md §1.7).
    const startPath = takeStartParamPath();
    if (startPath) openStartPath(startPath);
    // Show the app after the first frame so Telegram's splash hands over to a painted screen.
    const frame = requestAnimationFrame(() => safely(() => miniApp.ready()));
    keep(() => cancelAnimationFrame(frame));

    const { rawInitData } = launch;
    // Screens can ask to sign in again (/login after a failure); the provider signs in once per page load.
    setMiniAppSignIn(rawInitData ? () => signIn(rawInitData) : null);
    if (rawInitData && !sentInitData.has(rawInitData)) {
      sentInitData.add(rawInitData);
      void signInToMiniApp();
    }

    return () => {
      for (const dispose of disposers.reverse()) dispose();
    };
  }, []);

  return (
    <>
      {children}
      <TelegramBackFallback />
    </>
  );
}
