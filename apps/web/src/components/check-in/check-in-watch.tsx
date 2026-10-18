"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { loadSessionMarks } from "@/lib/check-in/actions";

/** How often the page asks for the attendance: a check-in shows up within 5 seconds (PRD wave-3 5.1). */
export const WATCH_MS = 5_000;

/**
 * Keeps the trainer's session page current while check-in is open (PRD wave-3 §5 crit. 5.1): a client who checks
 * in by the session's QR or a place's QR appears in the marks without the trainer opening the QR sheet or reloading.
 * It asks only while the tab is visible and re-renders the page when the attendance differs from `marks`, which the
 * page built from the bookings it rendered. Renders nothing.
 */
export function CheckInWatch({ sessionId, marks }: { sessionId: string; marks: string }) {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let asking = false;
    const tick = async () => {
      clearTimeout(timer);
      if (asking) return;
      if (document.visibilityState === "visible") {
        asking = true;
        const next = await loadSessionMarks(sessionId).catch(() => null);
        asking = false;
        if (cancelled) return;
        // The new render brings new marks and this effect starts over with them; until then it keeps asking.
        if (next !== null && next !== marks) router.refresh();
      }
      timer = setTimeout(tick, WATCH_MS);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void tick();
    };
    timer = setTimeout(tick, WATCH_MS);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [sessionId, marks, router]);

  return null;
}
