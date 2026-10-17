"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect } from "react";
import { DURATION, EASE_OVERSHOOT, EASE_STANDARD } from "@/lib/motion";
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
export function DaRing({ state, value = 0, size = 44, animate = false, label, className }: DaRingProps) {
  const reduced = useReducedMotion();
  const play = animate && state === "done" && !reduced;
  const stroke = size >= 64 ? 4 : 5;

  useEffect(() => {
    if (animate && state === "done") hapticSuccess();
  }, [animate, state]);

  const draw = (delay: number, duration: number) =>
    play ? { initial: { pathLength: 0 }, animate: { pathLength: 1 }, transition: { delay, duration, ease: EASE_STANDARD } } : {};

  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("shrink-0", className)}
      {...(play
        ? { initial: { scale: 1 }, animate: { scale: [1, 1.12, 1] }, transition: { delay: 0.56, duration: 0.3, ease: EASE_OVERSHOOT } }
        : {})}
    >
      {state === "done" ? (
        <>
          <motion.path d={ARC} className="stroke-accent" strokeWidth={stroke} strokeLinecap="round" {...draw(0, 0.42)} />
          <motion.path
            d={CHECK}
            className="stroke-accent"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeLinejoin="round"
            {...draw(0.38, 0.26)}
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
    </motion.svg>
  );
}
