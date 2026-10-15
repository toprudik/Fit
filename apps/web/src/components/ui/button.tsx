import { cva } from "class-variance-authority";
import type { LucideIcon } from "lucide-react";
import { ButtonBase } from "@/components/ui/button-base";
import { cn } from "@/lib/utils";

/**
 * Button look (docs/design/components/Button). Also styles links directly:
 * `<Link className={buttonVariants({ variant: "secondary" })}>`.
 */
const buttonVariants = cva(
  [
    "relative inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap select-none",
    "transition-[scale,background-color,opacity] duration-[var(--duration-instant)] ease-standard active:scale-[0.97]",
    // A loading button is disabled too, but keeps full color: the spinner says what's going on.
    "disabled:cursor-default disabled:not-aria-busy:opacity-(--opacity-disabled)",
    "aria-disabled:pointer-events-none aria-disabled:not-aria-busy:opacity-(--opacity-disabled)",
    "motion-reduce:transition-none motion-reduce:active:scale-100",
  ],
  {
    variants: {
      variant: {
        primary: "bg-accent text-on-accent",
        secondary: "bg-surface-2 text-ink hover:bg-surface-3",
        ghost: "bg-transparent text-accent-ink hover:bg-surface-3",
        destructive: "bg-danger-soft text-danger",
      },
      size: {
        sm: "h-9 rounded-sm px-4 text-subhead font-semibold",
        md: "h-11 rounded-md px-5 text-headline",
        lg: "h-13 rounded-md px-6 text-headline",
      },
      block: {
        true: "w-full",
        false: "",
      },
    },
    // Ghost buttons sit in headers and rows, so they keep tight padding at every size.
    compoundVariants: [{ variant: "ghost", className: "px-3" }],
    defaultVariants: { variant: "primary", size: "md", block: false },
  },
);

type ButtonProps = React.ComponentProps<"button"> & {
  /** One `primary` per screen; `destructive` only for actions that can't be undone. */
  variant?: "primary" | "secondary" | "ghost" | "destructive";
  /** 36, 44 or 52 px tall; `lg` is the bottom button of a screen. */
  size?: "sm" | "md" | "lg";
  /** Full width. */
  block?: boolean;
  /** Spinner in place of the icon; the button keeps its width and ignores presses. */
  loading?: boolean;
  /** Lucide icon before the label. */
  icon?: LucideIcon;
  /** Gives the button look to the single child element, e.g. a `Link`. */
  asChild?: boolean;
};

/**
 * DaFit button. The label is a verb that says what happens ("Записаться"). Pressing the primary
 * button vibrates lightly in Telegram.
 */
function Button({ variant = "primary", size = "md", block = false, loading = false, icon: Icon, className, ...props }: ButtonProps) {
  return (
    <ButtonBase
      data-slot="button"
      data-variant={variant}
      className={cn(buttonVariants({ variant, size, block }), className)}
      icon={Icon ? <Icon aria-hidden size={20} strokeWidth={1.75} /> : null}
      loading={loading}
      haptic={variant === "primary"}
      {...props}
    />
  );
}

export { Button, buttonVariants };
