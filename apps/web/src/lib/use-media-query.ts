"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Whether a media query matches. The server and the first client render say false, so use it only
 * for details that may change right after hydration (a tooltip), never for the layout itself: that is
 * CSS's job.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window.matchMedia !== "function") return () => {};
      const media = window.matchMedia(query);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    [query],
  );
  const matches = () => typeof window.matchMedia === "function" && window.matchMedia(query).matches;
  return useSyncExternalStore(subscribe, matches, () => false);
}
