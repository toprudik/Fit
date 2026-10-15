"use client";

import { useSyncExternalStore } from "react";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { switchLocale, useI18n } from "@/i18n/client";
import { LOCALES } from "@/i18n/config";
import { setThemePreference, useTheme } from "@/lib/theme/store";
import type { ThemePreference } from "@/lib/theme/theme";

const subscribeNever = () => () => {};

/** False while the server HTML is hydrated, true once the client renders on its own. */
function useHydrated() {
  return useSyncExternalStore(subscribeNever, () => true, () => false);
}

/**
 * One setting: a caption, the control and an optional note. The segmented control is a filled
 * surface itself, so it sits on the screen directly instead of inside a card (no card in a card);
 * captions are inset like field labels in the design system.
 */
function Setting({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="px-1 text-footnote text-ink-2">{label}</h2>
      {children}
      {hint ? <p className="px-1 text-footnote text-ink-2">{hint}</p> : null}
    </section>
  );
}

/**
 * Interface settings for this device: theme and language (ADR 0010, ADR 0015). The theme applies
 * at once; a new language reloads the page, since every server-rendered string changes with it.
 */
export function SettingsPanel() {
  const { locale, t } = useI18n();
  const { preference } = useTheme();
  const hydrated = useHydrated();

  const themeOptions: { value: ThemePreference; label: string }[] = [
    { value: "system", label: t.settings.theme.system },
    { value: "light", label: t.settings.theme.light },
    { value: "dark", label: t.settings.theme.dark },
  ];
  const languageOptions = LOCALES.map((value) => ({ value, label: t.languages[value] }));

  return (
    <div className="flex flex-col gap-8">
      <Setting label={t.settings.theme.label} hint={t.settings.theme.hint}>
        {/* The saved theme is only known in the browser. Remounting after hydration puts the thumb
            on it straight away instead of sliding it over from Auto on every page load. */}
        <SegmentedControl
          key={hydrated ? "client" : "server"}
          label={t.settings.theme.label}
          options={themeOptions}
          value={preference}
          onValueChange={setThemePreference}
        />
      </Setting>
      <Setting label={t.settings.language.label}>
        <SegmentedControl label={t.settings.language.label} options={languageOptions} value={locale} onValueChange={switchLocale} />
      </Setting>
    </div>
  );
}
