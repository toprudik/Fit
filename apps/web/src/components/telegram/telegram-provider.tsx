"use client";

import { backButton, init, isTMA, miniApp, retrieveRawInitData, themeParams, viewport } from "@tma.js/sdk-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";
import { useI18n } from "@/i18n/client";
import { isLocale } from "@/i18n/config";
import { markMiniAppReady } from "@/lib/telegram/mini-app";
import { setTelegramScheme } from "@/lib/theme/store";

function safely(fn: () => void) {
  try {
    fn();
  } catch {
    // Feature not supported by this Telegram client: ignore.
  }
}

/** Paints Telegram's header, background and bottom bar in the current theme's `bg` (ADR 0010). */
function paintTelegramChrome() {
  const bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
  if (!bg) return;
  safely(() => miniApp.setHeaderColor(bg as `#${string}`));
  safely(() => miniApp.setBgColor(bg as `#${string}`));
  safely(() => miniApp.setBottomBarColor(bg as `#${string}`));
}

/**
 * Inside Telegram: mounts the Mini App SDK, takes the light/dark scheme and safe areas from
 * Telegram (never its colors), keeps Telegram's chrome in DaFit's background color and signs the
 * user in from initData (verified on the server). Outside Telegram it does nothing.
 */
export function TelegramProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { locale, t } = useI18n();
  const signInFailed = t.telegram.signInFailed;

  useEffect(() => {
    if (!isTMA()) return;
    const cleanup = init();
    const root = document.documentElement;
    root.dataset.tma = "";
    const disposers: (() => void)[] = [];

    safely(() => miniApp.mount());
    safely(() => themeParams.mount());
    safely(() => backButton.mount());
    safely(() => {
      void viewport.mount().then(() => {
        safely(() => viewport.expand());
        // Safe-area insets become --tg-viewport-* variables, read by --safe-* in globals.css.
        safely(() => {
          disposers.push(viewport.bindCssVars());
        });
      });
    });

    safely(() => {
      setTelegramScheme(miniApp.isDark() ? "dark" : "light");
      disposers.push(miniApp.isDark.sub((dark) => setTelegramScheme(dark ? "dark" : "light")));
    });

    paintTelegramChrome();
    const observer = new MutationObserver(paintTelegramChrome);
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    disposers.push(() => observer.disconnect());

    markMiniAppReady();
    // Show the app after the first frame so Telegram's splash hands over to a painted screen.
    const frame = requestAnimationFrame(() => safely(() => miniApp.ready()));
    disposers.push(() => cancelAnimationFrame(frame));

    const rawInitData = retrieveRawInitData();
    if (rawInitData) void signIn(rawInitData);

    async function signIn(raw: string) {
      try {
        const res = await fetch("/api/auth/telegram/mini-app", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ initData: raw }),
        });
        if (!res.ok) throw new Error(String(res.status));
        // Session cookies are httpOnly, so the server decides whether this was a new sign-in.
        const { fresh, locale: detected } = (await res.json()) as { fresh?: boolean; locale?: string };
        // First launch: the server picked the language from Telegram; re-render in it if it differs.
        if (isLocale(detected) && detected !== locale) window.location.reload();
        else if (fresh) router.refresh();
      } catch {
        toast.error(signInFailed);
      }
    }

    return () => {
      for (const dispose of disposers) dispose();
      cleanup();
    };
  }, [router, locale, signInFailed]);

  return children;
}
