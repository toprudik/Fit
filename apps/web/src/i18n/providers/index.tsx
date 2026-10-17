"use client";

import dynamic from "next/dynamic";
import type { Locale } from "../config";

/**
 * The i18n provider for one language. Each catalog sits in its own lazily loaded module, so the browser
 * downloads only the active language's strings (Next preloads the chunk the server rendered with). A catalog
 * passed from the server as a prop would instead be serialized into every HTML response and miss the JS cache.
 */
const PROVIDERS: Record<Locale, React.ComponentType<{ children: React.ReactNode }>> = {
  ru: dynamic(() => import("./ru").then((m) => m.RuI18nProvider)),
  en: dynamic(() => import("./en").then((m) => m.EnI18nProvider)),
};

export function LocaleI18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const Provider = PROVIDERS[locale];
  return <Provider>{children}</Provider>;
}
