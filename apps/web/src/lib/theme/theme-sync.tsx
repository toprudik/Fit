"use client";

import { useLayoutEffect } from "react";
import { THEME_BG } from "./colors";
import { applyThemeAttribute, useTheme } from "./store";

/**
 * Mounted once in the root layout. Keeps the theme store subscribed on every screen, so "Авто"
 * follows a system scheme change live even where nothing else reads the theme, and applies the
 * theme before paint when the document was rendered on the client. Also paints the browser's
 * theme-color (address bar) in the theme actually shown, which may be pinned against the system.
 */
export function ThemeSync() {
  const { theme } = useTheme();
  useLayoutEffect(applyThemeAttribute, []);
  useLayoutEffect(() => {
    // The server snapshot is the dark default; read the real theme from <html> after hydration.
    const shown = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
    for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) meta.content = THEME_BG[shown];
  }, [theme]);
  return null;
}
