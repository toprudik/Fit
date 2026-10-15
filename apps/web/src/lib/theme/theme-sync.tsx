"use client";

import { useLayoutEffect } from "react";
import { applyThemeAttribute, useTheme } from "./store";

/**
 * Mounted once in the root layout. Keeps the theme store subscribed on every screen, so "Авто"
 * follows a system scheme change live even where nothing else reads the theme, and applies the
 * theme before paint when the document was rendered on the client.
 */
export function ThemeSync() {
  useTheme();
  useLayoutEffect(applyThemeAttribute, []);
  return null;
}
