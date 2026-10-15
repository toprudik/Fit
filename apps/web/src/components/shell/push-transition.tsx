"use client";

import { animate } from "motion/react";
import { useLayoutEffect, useRef } from "react";
import { DURATION, EASE_STANDARD, prefersReducedMotion } from "@/lib/motion";
import { arrival } from "./navigation-tracker";

/**
 * Wraps a pushed screen (settings, a client card) so that it slides in from the right when opened
 * from inside the app (brand.md "Движение"): from 30% of its width to its place over `duration-slow`,
 * no spring. With reduced motion it only fades in, within 100ms.
 *
 * The server HTML is never hidden: the animation starts on mount, before the first paint, and only
 * for in-app pushes. A first page load, a reload and the browser's back/forward show the screen at
 * once. The outgoing screen's parallax (it shifts a third left and dims) is not done yet.
 */
export function PushTransition({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  // A layout effect starts the animation before the browser paints the new screen, so it never
  // flashes in place. It also runs when Next shows a kept screen again (Activity) after a push.
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || arrival() !== "push") return;
    const controls = prefersReducedMotion()
      ? animate(element, { opacity: [0, 1] }, { duration: DURATION.instant, ease: "linear" })
      : animate(
          element,
          { opacity: [0, 1], transform: ["translateX(30%)", "translateX(0)"] },
          { duration: DURATION.slow, ease: EASE_STANDARD },
        );
    // A transform left on the wrapper would trap position: fixed descendants.
    void controls.then(() => element.style.removeProperty("transform"));
    return () => {
      controls.stop();
      element.style.removeProperty("transform");
      element.style.removeProperty("opacity");
    };
  }, []);

  // The outer clip keeps the incoming screen from widening the page while it slides; `clip`, unlike
  // `hidden`, makes no scroll container, so sticky headers inside still stick.
  return (
    <div className="overflow-x-clip">
      <div ref={ref}>{children}</div>
    </div>
  );
}
