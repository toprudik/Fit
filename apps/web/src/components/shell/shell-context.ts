"use client";

import { createContext, use } from "react";
import type { Zone } from "@/lib/navigation/zones";

export type Shell = {
  /** Zone of the current screen, from the path prefix. */
  zone: Zone;
  /** Opens the profile sheet: account, zone switch, settings. */
  openProfile: () => void;
};

/** Provided by AppShell around every zone screen. Kept apart so headers don't pull in the whole shell. */
export const ShellContext = createContext<Shell | null>(null);

/** The zone shell around the current screen. Only inside AppShell (zone screens and their sheets). */
export function useShell(): Shell {
  const shell = use(ShellContext);
  if (!shell) throw new Error("useShell must be used inside AppShell");
  return shell;
}

/** Like useShell, but null on screens outside the zones, such as settings or the profile page. */
export function useOptionalShell(): Shell | null {
  return use(ShellContext);
}
