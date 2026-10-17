"use client";

import { useEffect } from "react";
import { recordAppOpen } from "@/lib/analytics/actions";

const KEY = "dafit:app-open";

/**
 * Tells the server once per tab that the app was opened, and from which bot button (?source=). A later
 * ?source= in the same tab, a bot button tapped while the app is open, counts as a new opening.
 */
export function AppOpenBeacon() {
  useEffect(() => {
    const source = new URLSearchParams(window.location.search).get("source");
    let seen: string | null = null;
    try {
      seen = window.sessionStorage.getItem(KEY);
      window.sessionStorage.setItem(KEY, source ?? "direct");
    } catch {
      // Storage can be blocked; then every load counts and the server folds repeats within 30 minutes.
    }
    if (seen !== null && source === null) return;
    void recordAppOpen(source);
  }, []);
  return null;
}
