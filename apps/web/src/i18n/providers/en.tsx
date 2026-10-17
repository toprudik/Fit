import { I18nProvider } from "../client";
import { en } from "../dictionaries/en";

/** The en catalog, loaded on its own by LocaleI18nProvider. */
export function EnI18nProvider({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider locale="en" t={en}>
      {children}
    </I18nProvider>
  );
}
