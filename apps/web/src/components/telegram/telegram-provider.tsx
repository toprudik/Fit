"use client";

import { init, isTMA, miniApp, retrieveRawInitData, themeParams, viewport } from "@tma.js/sdk-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";

function safely(fn: () => void) {
  try {
    fn();
  } catch {
    // Feature not supported by this Telegram client — ignore.
  }
}

/**
 * Inside Telegram: initialises the Mini App SDK, binds Telegram theme to our CSS tokens and
 * signs the user in from initData (verified on the server). Outside Telegram it does nothing.
 */
export function TelegramProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    if (!isTMA()) return;
    const cleanup = init();
    document.documentElement.dataset.tma = "";

    safely(() => miniApp.mount());
    safely(() => themeParams.mount());
    safely(() => themeParams.bindCssVars());
    safely(() => miniApp.ready());
    safely(() => {
      void viewport.mount().then(() => viewport.expand());
    });

    const rawInitData = retrieveRawInitData();
    if (rawInitData) void signIn(rawInitData);

    async function signIn(raw: string) {
      const res = await fetch("/api/auth/telegram/mini-app", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData: raw }),
      });
      // Session cookies are httpOnly, so the server decides whether this was a new sign-in.
      if (res.ok) {
        const { fresh } = (await res.json()) as { fresh?: boolean };
        if (fresh) router.refresh();
      }
      else toast.error("Не удалось войти через Telegram");
    }

    return cleanup;
  }, [router]);

  return children;
}
