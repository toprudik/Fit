"use client";

import { animate } from "motion/mini";
import { useEffect, useLayoutEffect, useRef } from "react";
import { DURATION, EASE_OVERSHOOT, EASE_STANDARD, prefersReducedMotion } from "@/lib/motion";
import { hapticSuccess } from "@/lib/telegram/mini-app";
import { cn } from "@/lib/utils";

const ARC = "M38.72 15.5A17 17 0 1 1 28.4 7.58";
const CHECK = "M15.5 25L22 31.5L35.5 11";

type DaRingProps = {
  /** "done": the ring closed with the check; "progress": an arc for `value` of the way. */
  state: "done" | "progress";
  /** 0..1 for "progress". */
  value?: number;
  /** Diameter in px: 24 or 28 in a row, 44 on a card, 64 to 120 in a large block. */
  size?: number;
  /** Plays the Da-moment once on mount (docs/design/brand.md): only right after a person's action or a new milestone. */
  animate?: boolean;
  /** For screen readers; decorative without it. */
  label?: string;
  className?: string;
};

/**
 * The Da-ring (docs/design/components/DaRing): the brand's session ring. When it closes, the check breaks out
 * of it with the one celebratory animation of the product and Telegram's success vibration. With reduced motion
 * the ring shows its final state at once and the vibration stays.
 */
export function DaRing({ state, value = 0, size = 44, animate: celebrate = false, label, className }: DaRingProps) {
  const play = celebrate && state === "done";
  const stroke = size >= 64 ? 4 : 5;
  const svgRef = useRef<SVGSVGElement>(null);
  const arcRef = useRef<SVGPathElement>(null);
  const checkRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    if (celebrate && state === "done") hapticSuccess();
  }, [celebrate, state]);

  // The paths render undrawn (dash offset 1 of pathLength 1) and draw themselves in; with reduced motion they
  // jump to the drawn state. Motion's WAAPI animate() keeps the engine of motion/react out of the page.
  useLayoutEffect(() => {
    const [svg, arc, check] = [svgRef.current, arcRef.current, checkRef.current];
    if (!play || !svg || !arc || !check) return;
    if (prefersReducedMotion()) {
      for (const path of [arc, check]) path.style.strokeDashoffset = "0";
      return;
    }
    const draw = (path: SVGPathElement, delay: number, duration: number) => {
      const run = animate(path, { strokeDashoffset: ["1", "0"] }, { delay, duration, ease: EASE_STANDARD });
      void run.then(() => {
        path.style.strokeDashoffset = "0";
      });
      return run;
    };
    const runs = [
      draw(arc, 0, 0.42),
      draw(check, 0.38, 0.26),
      animate(svg, { transform: ["scale(1)", "scale(1.12)", "scale(1)"] }, { delay: 0.56, duration: 0.3, ease: EASE_OVERSHOOT }),
    ];
    return () => runs.forEach((run) => run.stop());
  }, [play]);

  const undrawn = play ? { pathLength: 1, strokeDasharray: "1 1", strokeDashoffset: 1 } : {};

  return (
    <svg
      ref={svgRef}
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("shrink-0 origin-center", className)}
    >
      {state === "done" ? (
        <>
          <path ref={arcRef} d={ARC} className="stroke-accent" strokeWidth={stroke} strokeLinecap="round" {...undrawn} />
          <path
            ref={checkRef}
            d={CHECK}
            className="stroke-accent"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeLinejoin="round"
            {...undrawn}
          />
        </>
      ) : (
        <>
          <circle cx={24} cy={24} r={17} className="stroke-surface-3" strokeWidth={stroke} />
          {value > 0 ? (
            <circle
              cx={24}
              cy={24}
              r={17}
              className="stroke-accent"
              strokeWidth={stroke}
              strokeLinecap="round"
              pathLength={100}
              strokeDasharray={`${Math.min(1, value) * 100} 100`}
              transform="rotate(-90 24 24)"
              style={{ transition: `stroke-dasharray ${DURATION.slow}s` }}
            />
          ) : null}
        </>
      )}
    </svg>
  );
}
