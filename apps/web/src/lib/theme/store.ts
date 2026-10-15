import { useSyncExternalStore } from "react";
import { preferenceCookie, readCookie } from "@/lib/preferences";
import {
  parseThemePreference,
  resolveTheme,
  TELEGRAM_SCHEME_KEY,
  THEME_COOKIE,
  type Theme,
  type ThemePreference,
} from "./theme";

type ThemeState = { preference: ThemePreference; telegram: Theme | null; systemLight: boolean; theme: Theme };

const SERVER_STATE: ThemeState = { preference: "system", telegram: null, systemLight: false, theme: "dark" };
const LIGHT_QUERY = "(prefers-color-scheme: light)";

let state: ThemeState | null = null;
const listeners = new Set<() => void>();
let mediaCleanup: (() => void) | null = null;

function readTelegramScheme(): Theme | null {
  try {
    const saved = sessionStorage.getItem(TELEGRAM_SCHEME_KEY);
    return saved === "light" || saved === "dark" ? saved : null;
  } catch {
    return null;
  }
}

function initialState(): ThemeState {
  const preference = parseThemePreference(readCookie(document.cookie, THEME_COOKIE));
  const telegram = readTelegramScheme();
  const systemLight = window.matchMedia?.(LIGHT_QUERY).matches ?? false;
  return { preference, telegram, systemLight, theme: resolveTheme(preference, { telegram, systemLight }) };
}

function current(): ThemeState {
  state ??= initialState();
  return state;
}

function update(patch: Partial<Omit<ThemeState, "theme">>) {
  const next = { ...current(), ...patch };
  next.theme = resolveTheme(next.preference, next);
  state = next;
  // The DOM attribute drives every token; keep it in step with the store, not with React renders.
  document.documentElement.setAttribute("data-theme", next.theme);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!mediaCleanup && window.matchMedia) {
    const media = window.matchMedia(LIGHT_QUERY);
    const onChange = (event: MediaQueryListEvent) => update({ systemLight: event.matches });
    media.addEventListener("change", onChange);
    mediaCleanup = () => media.removeEventListener("change", onChange);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      mediaCleanup?.();
      mediaCleanup = null;
    }
  };
}

/**
 * Puts the store's theme on <html>. The pre-paint script normally did that already; this covers
 * documents React renders on the client (Next's 404 shell), where inline scripts never run.
 */
export function applyThemeAttribute() {
  document.documentElement.setAttribute("data-theme", current().theme);
}

/** Saves the user's choice in a cookie (read by the pre-paint script) and applies it right away. */
export function setThemePreference(preference: ThemePreference) {
  document.cookie = preferenceCookie(THEME_COOKIE, preference);
  update({ preference });
}

/** Called by the Telegram provider with the Mini App's color scheme (null outside Telegram). */
export function setTelegramScheme(telegram: Theme | null) {
  try {
    if (telegram) sessionStorage.setItem(TELEGRAM_SCHEME_KEY, telegram);
  } catch {
    // Storage blocked: the scheme still applies for this page view.
  }
  if (current().telegram !== telegram) update({ telegram });
}

/** Saved preference and the theme actually shown. Server render and hydration see the defaults. */
export function useTheme(): { preference: ThemePreference; theme: Theme } {
  const snapshot = useSyncExternalStore(subscribe, current, () => SERVER_STATE);
  return { preference: snapshot.preference, theme: snapshot.theme };
}

/** Test hook: forget cached state so the next read starts from the DOM again. */
export function resetThemeStoreForTests() {
  state = null;
  listeners.clear();
  mediaCleanup?.();
  mediaCleanup = null;
}
