import { I18nProvider } from "../client";
import { ru } from "../dictionaries/ru";

/** The ru catalog, loaded on its own by LocaleI18nProvider. */
export function RuI18nProvider({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider locale="ru" t={ru}>
      {children}
    </I18nProvider>
  );
}
