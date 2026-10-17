import { cleanup, render, type RenderOptions } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach } from "vitest";
import { I18nProvider } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import { dictionaries } from "@/i18n/dictionaries";

afterEach(cleanup);

/** Renders a Client Component the way the app does: inside the i18n provider for `locale`. */
export function renderWithProviders(ui: ReactElement, { locale = "ru", ...options }: { locale?: Locale } & RenderOptions = {}) {
  return render(ui, { wrapper: ({ children }) => <I18nProvider locale={locale} t={dictionaries[locale]}>
        {children}
      </I18nProvider>, ...options });
}
