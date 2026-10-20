"use client";

import { useEffect } from "react";
import { recordAppOpen } from "@/lib/analytics/actions";

/**
 * Tells the server that the app was opened, and from which bot button (?source=). The root layout mounts once per
 * page load, so this runs on a load or reload, not on navigation inside the app. Nothing is kept in the browser: the
 * server folds repeats with the same source within 30 minutes into one visit and skips users who switched the
 * count off in /settings/app-opens (legal item Б12).
 */
export function AppOpenBeacon() {
  useEffect(() => {
    void recordAppOpen(new URLSearchParams(window.location.search).get("source"));
  }, []);
  return null;
}
