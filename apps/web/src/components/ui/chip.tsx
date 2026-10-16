import { Check } from "lucide-react";
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
    <label data-slot="chip" className={cn("relative inline-flex cursor-pointer", className)}>
      <input type="checkbox" className="peer absolute inset-0 size-full cursor-pointer appearance-none rounded-full" {...input} />
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
