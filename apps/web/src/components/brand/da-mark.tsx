import { cn } from "@/lib/utils";

/**
 * Da-mark: a ring with a check coming out of it (docs/design/assets/Brand). One color, `accent`
 * blue, minimum 16 px. Decorative unless a label is given.
 */
export function DaMark({ className, label }: { className?: string; label?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={cn("size-6 shrink-0 text-accent", className)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      fill="none"
      stroke="currentColor"
      strokeWidth={5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M38.72 15.5A17 17 0 1 1 28.4 7.58" />
      <path d="M15.5 25L22 31.5L35.5 11" />
    </svg>
  );
}
