import { cn } from "@/lib/utils";

/**
 * 18 px ring with a gap, in the current text color: a loading Button, a loading toast. With reduced
 * motion it stands still. Decorative: the busy state is announced by the element that owns it.
 */
export function Spinner({ className }: { className?: string }) {
  return (
    <span
      data-slot="spinner"
      aria-hidden
      className={cn(
        "block size-4.5 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent",
        "[animation-duration:700ms] motion-reduce:animate-none",
        className,
      )}
    />
  );
}
