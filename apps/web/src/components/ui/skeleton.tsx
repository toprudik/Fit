import { cn } from "@/lib/utils";

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
      className={cn("skeleton-shimmer skeleton-delayed block h-3.5 w-full rounded-full bg-surface-2", className)}
    />
  );
}

// Line widths of the reference skeleton (bundle.js), repeated for longer lists.
const LINE_WIDTHS = [
  ["70%", "45%"],
  ["58%", "53%"],
  ["46%", "61%"],
] as const;

/** Announces a loading placeholder to screen readers; without a label it is a silent part of a bigger one. */
function statusProps(label: string | undefined) {
  return label ? ({ role: "status", "aria-busy": true, "aria-label": label } as const) : ({ "aria-hidden": true } as const);
}

type SkeletonRowsProps = {
  rows?: number;
  /** What screen readers hear, e.g. `t.common.loading`; leave it out inside a `SkeletonScreen`. */
  label?: string;
  /** What starts each row, as in the list it stands for: an icon tile (default), a person's photo or nothing. */
  leading?: "tile" | "avatar" | "none";
  /** A caption line above the group, where the list has a `ListGroup` header. */
  header?: boolean;
  className?: string;
};

/**
 * Placeholder for a list that is still loading, drawn like `ListGroup` and `ListRow`: the same row
 * height, paddings, separators and leading tile or photo, so the real list replaces it in place
 * (docs/design/components/Skeleton).
 */
function SkeletonRows({ rows = 3, label, leading = "tile", header = false, className }: SkeletonRowsProps) {
  const group = (
    <div className="overflow-hidden rounded-lg bg-surface-1">
      {Array.from({ length: rows }, (_, index) => {
        const [first, second] = LINE_WIDTHS[index % LINE_WIDTHS.length];
        return (
          <div
            key={index}
            className={cn(
              "relative flex min-h-13 items-center gap-3 px-4 py-3",
              index > 0 && "before:absolute before:top-0 before:right-0 before:h-px before:bg-line",
              leading === "avatar" ? "before:left-17" : leading === "tile" ? "before:left-[58px]" : "before:left-4",
            )}
          >
            {leading === "avatar" ? <span className="size-10 shrink-0 rounded-full bg-surface-2" /> : null}
            {leading === "tile" ? <span className="size-7.5 shrink-0 rounded-xs bg-surface-2" /> : null}
            <div className="flex flex-1 flex-col gap-2 py-1">
              <span className="skeleton-shimmer block h-3.5 rounded-full bg-surface-2" style={{ width: first }} />
              <span className="skeleton-shimmer block h-3 rounded-full bg-surface-2" style={{ width: second }} />
            </div>
          </div>
        );
      })}
    </div>
  );
  return (
    <div
      data-slot="skeleton-rows"
      {...statusProps(label)}
      className={cn("flex flex-col gap-1.5", label && "skeleton-delayed", className)}
    >
      {header ? <span aria-hidden className="skeleton-shimmer mx-4 my-0.5 block h-3 w-28 rounded-full bg-surface-2" /> : null}
      {group}
    </div>
  );
}

/** Placeholder for a `SegmentedControl`: its track with `count` equal parts, `selected` of them marked. */
function SkeletonSegments({ count = 3, selected = 0, className }: { count?: number; selected?: number; className?: string }) {
  return (
    <div aria-hidden className={cn("grid h-11 auto-cols-[minmax(0,1fr)] grid-flow-col rounded-sm bg-surface-2 p-[3px]", className)}>
      {Array.from({ length: count }, (_, index) => (
        <span key={index} className={cn("rounded-xs", index === selected && "bg-surface-3")} />
      ))}
    </div>
  );
}

/** Placeholder for a row of filter chips or small buttons. */
function SkeletonChips({ widths = ["4.5rem", "6rem", "7rem"], className }: { widths?: string[]; className?: string }) {
  return (
    <div aria-hidden className={cn("flex gap-2 overflow-hidden", className)}>
      {widths.map((width, index) => (
        <span key={index} className="skeleton-shimmer block h-8 shrink-0 rounded-full bg-surface-1" style={{ width }} />
      ))}
    </div>
  );
}

/**
 * Placeholder for an `EmptyState` with a description and an action, line for line: the 64px tile,
 * the title, two lines of text and the button, 302px in all like the real one.
 */
function SkeletonEmpty({ label, className }: { label?: string; className?: string }) {
  return (
    <div
      data-slot="skeleton-empty"
      {...statusProps(label)}
      className={cn("flex flex-col items-center gap-3 px-6 py-10", label && "skeleton-delayed", className)}
    >
      <span className="skeleton-shimmer mb-1 block size-16 rounded-lg bg-surface-1" />
      <span className="flex h-6.5 items-center">
        <span className="skeleton-shimmer block h-4 w-44 rounded-full bg-surface-2" />
      </span>
      <span className="mb-2 flex flex-col items-center">
        <span className="flex h-5 items-center">
          <span className="skeleton-shimmer block h-3 w-60 rounded-full bg-surface-2" />
        </span>
        <span className="flex h-5 items-center">
          <span className="skeleton-shimmer block h-3 w-40 rounded-full bg-surface-2" />
        </span>
      </span>
      <span className="skeleton-shimmer block h-11 w-44 rounded-md bg-surface-1" />
    </div>
  );
}

/**
 * A loading screen made of the placeholders above, shaped like the screen it stands for. It is
 * announced once, as `label`, and like every skeleton appears only after 300 ms.
 */
function SkeletonScreen({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div data-slot="skeleton-screen" {...statusProps(label)} className={cn("skeleton-delayed flex flex-col gap-4", className)}>
      {children}
    </div>
  );
}

export { Skeleton, SkeletonChips, SkeletonEmpty, SkeletonRows, SkeletonScreen, SkeletonSegments };
