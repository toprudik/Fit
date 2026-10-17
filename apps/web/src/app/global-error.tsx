"use client";

import { useEffect, useState } from "react";
import { ErrorScreen, reportError, useClientValue, useFeedbackHref } from "@/components/errors/error-screen";
import { onest, tekturNarrow } from "@/fonts";
import { DEFAULT_LOCALE, LOCALE_COOKIE, matchLocale, type Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { themeInitScript } from "@/lib/theme/init-script";
import "./globals.css";

/** The catalog of one language, loaded only when this page shows: it is part of every page's bundle. */
const CATALOGS: Record<Locale, () => Promise<Dictionary>> = {
  ru: () => import("@/i18n/dictionaries/ru").then((m) => m.ru),
  en: () => import("@/i18n/dictionaries/en").then((m) => m.en),
};

/** The saved language, else the browser's, as the proxy would pick it. */
function currentLocale(): Locale {
  const saved = document.cookie.match(new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE}=([^;]*)`));
  return matchLocale(saved ? decodeURIComponent(saved[1]) : null) ?? matchLocale(navigator.language) ?? DEFAULT_LOCALE;
}

/**
 * The root layout itself crashed (PRD wave-1 §2.13 rule 1). Renders its own document without the app's
 * providers, so it picks the language and theme by itself; the text appears once its catalog has loaded.
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const [t, setT] = useState<Dictionary | null>(null);
  const locale = useClientValue(currentLocale, DEFAULT_LOCALE);
  const feedbackHref = useFeedbackHref();

  useEffect(() => reportError(error), [error]);
  useEffect(() => {
    let live = true;
    void CATALOGS[locale]().then((catalog) => {
      if (live) setT(catalog);
    });
    return () => {
      live = false;
    };
  }, [locale]);

  return (
    <html lang={locale} data-theme="dark" className={`${onest.variable} ${tekturNarrow.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        {t ? <title>{`${t.errorPage.title} | ${t.meta.appName}`}</title> : null}
      </head>
      <body>{t ? <ErrorScreen t={t.errorPage} onRetry={retry} feedbackHref={feedbackHref} /> : null}</body>
    </html>
  );
}
