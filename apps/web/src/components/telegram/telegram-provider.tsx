"use client";

import {
  backButton,
  init,
  isTMA,
  miniApp,
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
import { isLocale } from "@/i18n/config";
import { markMiniAppReady, safely, safelyAsync } from "@/lib/telegram/mini-app";
import { THEME_BG } from "@/lib/theme/colors";
import { setTelegramScheme } from "@/lib/theme/store";
import { isColorDark } from "@/lib/theme/theme";

const SETTINGS_HREF = "/settings";

/**
 * initData already sent this page load. React runs effects twice in development, and a second
 * sign-in would answer `fresh: false` while the first one's answer is thrown away.
 */
const sentInitData = new Set<string>();

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
 * Inside Telegram: mounts the Mini App SDK, takes the light/dark scheme and safe areas from
 * Telegram (never its colors), keeps Telegram's chrome in DaFit's background color, routes the
 * Settings item of Telegram's menu to /settings and signs the user in from initData (verified on
 * the server). Outside Telegram, or when the SDK can't start, it does nothing.
 */
export function TelegramProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { locale, t } = useI18n();

  const openSettings = useEffectEvent(() => {
    if (window.location.pathname !== SETTINGS_HREF) router.push(SETTINGS_HREF);
  });

  const signIn = useEffectEvent(async (initData: string) => {
    try {
      const res = await fetch("/api/auth/telegram/mini-app", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData }),
      });
      if (!res.ok) throw new Error(String(res.status));
      // Session cookies are httpOnly, so the server decides whether this was a new sign-in.
      const { fresh, locale: detected } = (await res.json()) as { fresh?: boolean; locale?: string };
      // First launch: the server picked the language from Telegram; re-render in it if it differs.
      if (isLocale(detected) && detected !== locale) window.location.reload();
      else if (fresh) router.refresh();
    } catch {
      toast.error(t.telegram.signInFailed);
    }
  });

  useEffect(() => {
    if (!safely(() => isTMA())) return;
    const launch = launchMiniApp();
    if (!launch) return;
    const disposers: (() => void)[] = [launch.cleanup];
    const keep = (dispose: (() => void) | undefined) => {
      if (dispose) disposers.push(dispose);
    };

    safely(() => miniApp.mount());
    safely(() => themeParams.mount());
    safely(() => backButton.mount());
    safely(() => settingsButton.mount());
    safely(() => swipeBehavior.mount());

    // The scheme first: it may change data-theme, and the chrome is painted from data-theme.
    keep(followTelegramScheme());
    paintTelegramChrome();
    const observer = new MutationObserver(paintTelegramChrome);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    keep(() => observer.disconnect());

    safely(() => settingsButton.show());
    keep(safely(() => settingsButton.onClick(() => openSettings())));

    safely(() => viewport.expand());
    // Safe-area insets become --tg-viewport-* variables, read by --safe-* in globals.css. They are
    // bound right away and fill in once the mount has asked Telegram for the insets.
    keep(safely(() => viewport.bindCssVars()));
    void safelyAsync(() => viewport.mount());

    markMiniAppReady();
    // Show the app after the first frame so Telegram's splash hands over to a painted screen.
    const frame = requestAnimationFrame(() => safely(() => miniApp.ready()));
    keep(() => cancelAnimationFrame(frame));

    const { rawInitData } = launch;
    if (rawInitData && !sentInitData.has(rawInitData)) {
      sentInitData.add(rawInitData);
      void signIn(rawInitData);
    }

    return () => {
      for (const dispose of disposers.reverse()) dispose();
    };
  }, []);

  return children;
}
