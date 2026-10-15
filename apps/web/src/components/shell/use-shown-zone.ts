"use client";

import { useState } from "react";
import { DEFAULT_ZONE, isZone, ZONE_COOKIE, type Zone } from "@/lib/navigation/zones";
import { readCookie } from "@/lib/preferences";
import { useHydrated } from "@/lib/use-hydrated";

/**
 * Zone the shell shows. Zone screens carry it in their path. Screens that belong to no zone
 * (settings, the profile page) keep the zone shown before them, and when opened directly, the zone
 * visited last (the dafit-zone cookie). That cookie is only read in the browser, so until hydration
 * ends the zone is null: the frame is drawn without zone items rather than with the wrong zone.
 */
export function useShownZone(routeZone: Zone | null): Zone | null {
  const hydrated = useHydrated();
  const [previous, setPrevious] = useState<Zone | null>(routeZone);
  if (routeZone !== null && routeZone !== previous) setPrevious(routeZone);

  if (routeZone !== null) return routeZone;
  if (previous !== null) return previous;
  if (!hydrated) return null;
  const saved = readCookie(document.cookie, ZONE_COOKIE);
  return isZone(saved) ? saved : DEFAULT_ZONE;
}
