import { cn } from "@/lib/utils";
import styles from "./skeleton.module.css";

/**
 * One placeholder line with a shimmer, shaped by `className` (`h-5 w-32`, `size-16 rounded-full`).
 * Hidden from screen readers; announce the loading state on the container (see `SkeletonRows`).
 * Appears only after 300 ms, so quick loads don't flash.
 */
function Skeleton({ className }: { className?: string }) {
  return (
    <span
      data-slot="skeleton"
      aria-hidden
      className={cn("block h-3.5 w-full rounded-full bg-surface-2", styles.shimmer, styles.delayed, className)}
    />
  );
}

// Line widths of the reference skeleton (bundle.js), repeated for longer lists.
const LINE_WIDTHS = [
  ["70%", "45%"],
  ["58%", "53%"],
  ["46%", "61%"],
] as const;

/**
 * Placeholder for a list that is still loading: rows of avatar + two lines on `surface-1`
 * (docs/design/components/Skeleton). `label` is what screen readers hear, e.g. `t.common.loading`.
 */
function SkeletonRows({ rows = 3, label, className }: { rows?: number; label: string; className?: string }) {
  return (
    <div
      data-slot="skeleton-rows"
      role="status"
      aria-busy
      aria-label={label}
      className={cn("flex flex-col gap-3 rounded-lg bg-surface-1 p-4", styles.delayed, className)}
    >
      {Array.from({ length: rows }, (_, index) => {
        const [first, second] = LINE_WIDTHS[index % LINE_WIDTHS.length];
        return (
          <div key={index} className="flex items-center gap-3">
            <span aria-hidden className="size-10 shrink-0 rounded-full bg-surface-2" />
            <div className="flex flex-1 flex-col gap-2">
              <span aria-hidden className={cn("block h-3.5 rounded-full bg-surface-2", styles.shimmer)} style={{ width: first }} />
              <span aria-hidden className={cn("block h-3.5 rounded-full bg-surface-2", styles.shimmer)} style={{ width: second }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export { Skeleton, SkeletonRows };
