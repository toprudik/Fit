"use client";

import { createContext, use } from "react";
import type { Zone } from "@/lib/navigation/zones";

export type Shell = {
  /**
   * Zone the shell shows: from the path on zone screens, the zone shown before on settings and the
   * profile page. Null only while such a screen, opened directly, waits for hydration (useShownZone).
   */
  zone: Zone | null;
  /** Opens the profile sheet: account, zone switch, settings. */
  openProfile: () => void;
  /** The screen is the root of the tab that holds the profile (PROFILE_TAB), in the Mini App at fullscreen. */
  onProfileTab?: boolean;
};

/** Provided by AppShell around every screen in the (zones) group. Kept apart so headers don't pull in the whole shell. */
export const ShellContext = createContext<Shell | null>(null);

/** The shell around the current screen, or null outside it (sign-in, the not-found page). */
export function useOptionalShell(): Shell | null {
  return use(ShellContext);
}
