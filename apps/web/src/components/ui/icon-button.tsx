import type { LucideIcon } from "lucide-react";
import { Slot } from "radix-ui";
import { cn } from "@/lib/utils";

type IconButtonProps = React.ComponentProps<"button"> & {
  icon: LucideIcon;
  /** What the button does, for screen readers ("Добавить занятие"): the button has no visible text. */
  label: string;
  /** `secondary` adds a `surface-2` fill. */
  variant?: "ghost" | "secondary";
  /** Gives the icon-button look to the single child element, e.g. a `Link`. */
  asChild?: boolean;
};

/**
 * Round 44 px button with a 24 px icon, for header and row actions everyone recognizes by the icon
 * (add, search, settings, more). Anything less obvious gets a `Button` with text.
 */
function IconButton({ icon: Icon, label, variant = "ghost", asChild = false, type, className, children, ...props }: IconButtonProps) {
  const classes = cn(
    "relative inline-grid size-11 shrink-0 cursor-pointer place-items-center rounded-full text-ink select-none",
    "transition-[scale,background-color] duration-[var(--duration-instant)] ease-standard hover:bg-surface-3 active:scale-[0.94]",
    "disabled:cursor-default disabled:opacity-(--opacity-disabled) motion-reduce:transition-none motion-reduce:active:scale-100",
    variant === "secondary" && "bg-surface-2",
    className,
  );
  const glyph = <Icon aria-hidden size={24} strokeWidth={1.75} />;

  if (asChild) {
    return (
      <Slot.Root data-slot="icon-button" aria-label={label} className={classes} {...props}>
        {glyph}
        <Slot.Slottable>{children}</Slot.Slottable>
      </Slot.Root>
    );
  }

  return (
    <button data-slot="icon-button" type={type ?? "button"} aria-label={label} className={classes} {...props}>
      {glyph}
      {children}
    </button>
  );
}

export { IconButton };
