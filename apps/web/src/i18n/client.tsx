"use client";

import { createContext, use, useMemo } from "react";
import { LOCALE_COOKIE, type Locale } from "./config";
import { dictionaries, type Dictionary } from "./dictionaries";
import { preferenceCookie } from "@/lib/preferences";

type I18nValue = { locale: Locale; t: Dictionary };

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const value = useMemo(() => ({ locale, t: dictionaries[locale] }), [locale]);
  return <I18nContext value={value}>{children}</I18nContext>;
}

/** Current locale and its catalog in Client Components. */
export function useI18n(): I18nValue {
  const value = use(I18nContext);
  if (!value) throw new Error("useI18n must be used inside I18nProvider");
  return value;
}

/**
 * Saves the language choice and reloads: the proxy picks the locale from this cookie, and a full
 * reload swaps every server-rendered string, <html lang> and the client router cache at once.
 */
export function switchLocale(locale: Locale) {
  document.cookie = preferenceCookie(LOCALE_COOKIE, locale);
  window.location.reload();
}
