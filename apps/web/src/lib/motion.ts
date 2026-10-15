/**
 * Motion tokens from docs/design/tokens.json in the units motion/react takes: seconds and bezier
 * arrays (it can't read CSS variables). CSS transitions keep using --duration-* and --easing-*.
 * src/lib/motion.test.ts keeps these in step with tokens.json.
 */
export const DURATION = { instant: 0.1, fast: 0.16, base: 0.24, slow: 0.4, da: 0.68 } as const;
export const EASE_STANDARD = [0.2, 0.8, 0.2, 1] as const;
export const EASE_EXIT = [0.4, 0, 1, 1] as const;
export const EASE_OVERSHOOT = [0.34, 1.56, 0.64, 1] as const;

/** Read when an animation starts, so it always follows the current system setting. */
export function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
