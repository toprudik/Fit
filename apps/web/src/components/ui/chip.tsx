import { Check, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

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
 * Filter or multiple choice (docs/design/components/Chip). Chips go in one scrolling row above a list;
 * see `ChipRow`. A link chip marks the selected one with aria-current, a button chip with aria-pressed.
 */
export function Chip({ selected = false, icon: Icon, href, onClick, children, className }: ChipProps) {
  const classes = cn(
    "relative inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-subhead font-semibold whitespace-nowrap select-none",
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
