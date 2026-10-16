import { Check, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type ChipCheckboxProps = Omit<React.ComponentProps<"input">, "type" | "children" | "className"> & {
  children: React.ReactNode;
  className?: string;
};

/**
 * Chip for picking several values in a form (docs/design/components/Chip). A real checkbox under the
 * pill, so the form posts it before hydration and screen readers hear "checkbox, checked". Selected
 * is inverse with a check mark, so it reads without color too.
 */
export function ChipCheckbox({ children, className, ...input }: ChipCheckboxProps) {
  return (
    <ChipInput type="checkbox" className={className} input={input}>
      {children}
    </ChipInput>
  );
}

/** The same chip for picking one value of a group: a real radio button under the pill. */
export function ChipRadio({ children, className, ...input }: ChipCheckboxProps) {
  return (
    <ChipInput type="radio" className={className} input={input}>
      {children}
    </ChipInput>
  );
}

function ChipInput({
  type,
  input,
  children,
  className,
}: {
  type: "checkbox" | "radio";
  input: Omit<ChipCheckboxProps, "children" | "className">;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label data-slot="chip" className={cn("relative inline-flex cursor-pointer", className)}>
      <input type={type} className="peer absolute inset-0 size-full cursor-pointer appearance-none rounded-full" {...input} />
      <span
        className={cn(
          "pointer-events-none inline-flex h-9 items-center gap-1.5 rounded-full bg-surface-2 px-4 text-subhead font-medium text-ink",
          "transition-[background-color,scale] duration-[var(--duration-instant)] ease-standard peer-active:scale-[0.96]",
          "peer-checked:bg-inverse peer-checked:text-on-inverse peer-hover:not-peer-checked:bg-surface-3",
          "motion-reduce:transition-none motion-reduce:peer-active:scale-100",
          "[&>svg]:hidden peer-checked:[&>svg]:block",
        )}
      >
        <Check aria-hidden size={16} strokeWidth={2.25} />
        {children}
      </span>
    </label>
  );
}

type ChipProps = {
  /** Selected chips turn `inverse` and get a check, so the choice reads without color. */
  selected?: boolean;
  icon?: LucideIcon;
  /** A filter that lives in the URL: the chip is a link. */
  href?: string;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
};

/**
 * Filter chip (docs/design/components/Chip) that acts at once: a link for a filter in the URL, or a toggle
 * button. Chips go in one scrolling row above a list; see `ChipRow`. A link chip marks the selected one with aria-current, a button chip with aria-pressed.
 */
export function Chip({ selected = false, icon: Icon, href, onClick, children, className }: ChipProps) {
  const classes = cn(
    "relative inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-4 text-subhead font-medium whitespace-nowrap select-none",
    "transition-[scale,background-color,color] duration-[var(--duration-instant)] ease-standard active:scale-[0.97]",
    "motion-reduce:transition-none motion-reduce:active:scale-100",
    // 44px hit area around the 36px chip.
    "before:absolute before:inset-x-0 before:-inset-y-1",
    selected ? "bg-inverse text-on-inverse" : "bg-surface-2 text-ink hover:bg-surface-3",
    className,
  );
  const GlyphIcon = selected ? Check : Icon;
  const content = (
    <>
      {GlyphIcon ? <GlyphIcon aria-hidden size={16} strokeWidth={2.25} /> : null}
      {children}
    </>
  );
  if (href !== undefined) {
    return (
      <Link data-slot="chip" href={href} onClick={onClick} aria-current={selected ? "true" : undefined} className={classes}>
        {content}
      </Link>
    );
  }
  return (
    <button data-slot="chip" type="button" onClick={onClick} aria-pressed={selected} className={classes}>
      {content}
    </button>
  );
}

/** One horizontally scrolling row of chips that runs to the screen edges on a phone. */
export function ChipRow({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <nav aria-label={label} className={cn("-mx-4 overflow-x-auto px-4 [scrollbar-width:none]", className)}>
      <div className="flex w-max gap-2 py-1">{children}</div>
    </nav>
  );
}
