"use client";

import { useLayoutEffect } from "react";
import { useHydrated } from "@/lib/use-hydrated";
import { THEME_BG } from "./colors";
import { applyThemeAttribute, useTheme } from "./store";

/**
 * Mounted once in the root layout. Keeps the theme store subscribed on every screen, so "Авто"
 * follows a system scheme change live even where nothing else reads the theme, and applies the
 * theme before paint when the document was rendered on the client.
 *
 * It also owns the browser's theme-color (the address bar): React hoists these tags into <head>
 * and keeps them across navigations. Until hydration they follow the system scheme; then they show
 * the theme actually on screen, which may be pinned against the system.
 */
export function ThemeSync() {
  const { theme } = useTheme();
  const hydrated = useHydrated();
  useLayoutEffect(applyThemeAttribute, []);

  if (!hydrated) {
    return (
      <>
        <meta name="theme-color" media="(prefers-color-scheme: dark)" content={THEME_BG.dark} />
        <meta name="theme-color" media="(prefers-color-scheme: light)" content={THEME_BG.light} />
      </>
    );
  }
  return <meta name="theme-color" content={THEME_BG[theme]} />;
}
