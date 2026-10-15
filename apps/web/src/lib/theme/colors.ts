import type { Theme } from "./theme";

/**
 * The `bg` token per theme as #rrggbb, for places that can't read CSS variables: Telegram's header,
 * background and bottom bar (the SDK accepts only six-digit hex, and the CSS minifier shortens
 * #000000 to #000) and the browser's theme-color. Checked against docs/design/tokens.json in tests.
 */
export const THEME_BG: Record<Theme, `#${string}`> = { dark: "#000000", light: "#f2f3f5" };
