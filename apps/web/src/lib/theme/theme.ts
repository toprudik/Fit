/** Theme preference saved by the user: follow Telegram/system, or pin light or dark (ADR 0010). */
export const THEME_PREFERENCES = ["system", "light", "dark"] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];
export type Theme = "light" | "dark";

export const THEME_COOKIE = "dafit-theme";
/** sessionStorage key with Telegram's last known color scheme, for reloads after the launch hash is gone. */
export const TELEGRAM_SCHEME_KEY = "dafit-tg-scheme";

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === "string" && (THEME_PREFERENCES as readonly string[]).includes(value);
}

export function parseThemePreference(value: string | null | undefined): ThemePreference {
  return isThemePreference(value) ? value : "system";
}

/**
 * A pinned theme wins. Otherwise Telegram's color scheme inside the Mini App, otherwise the
 * system setting; dark when the system has no light preference (dark is DaFit's default).
 */
export function resolveTheme(preference: ThemePreference, context: { telegram: Theme | null; systemLight: boolean }): Theme {
  if (preference !== "system") return preference;
  if (context.telegram) return context.telegram;
  return context.systemLight ? "light" : "dark";
}

/** Same brightness rule Telegram clients use to derive colorScheme from bg_color. */
export function isColorDark(color: string): boolean | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(color.trim());
  if (!match) return null;
  const n = Number.parseInt(match[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return Math.sqrt(0.299 * r * r + 0.587 * g * g + 0.114 * b * b) < 120;
}
