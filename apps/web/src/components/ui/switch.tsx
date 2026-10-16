"use client";

import { Switch as RadixSwitch } from "radix-ui";
import { useId } from "react";
import { hapticSelection } from "@/lib/telegram/mini-app";
import { cn } from "@/lib/utils";

type SwitchProps = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Always the accessible name; shown as a row label on the left with `showLabel`. */
  label: string;
  showLabel?: boolean;
  /** Explanation under the label, also read with the switch. */
  hint?: string;
  disabled?: boolean;
  className?: string;
};

/**
 * On/off switch that applies at once (docs/design/components/Switch). On it is `accent`, off it is
 * `line-strong`, so the white thumb reads in both themes. A choice confirmed by "Save" is a
 * SegmentedControl or Chip instead.
 */
export function Switch({ checked, onCheckedChange, label, showLabel = false, hint, disabled, className }: SwitchProps) {
  const id = useId();
  const control = (
    <RadixSwitch.Root
      id={id}
      checked={checked}
      onCheckedChange={(next) => {
        hapticSelection();
        onCheckedChange(next);
      }}
      disabled={disabled}
      aria-label={showLabel ? undefined : label}
      aria-describedby={hint ? `${id}-hint` : undefined}
      className={cn(
        "relative inline-flex h-[31px] w-[51px] shrink-0 cursor-pointer items-center rounded-full p-0.5",
        "transition-[background-color] duration-[var(--duration-base)] ease-standard motion-reduce:transition-none",
        "bg-line-strong data-[state=checked]:bg-accent disabled:cursor-default disabled:opacity-(--opacity-disabled)",
        // 44px hit area.
        "before:absolute before:-inset-x-1 before:-inset-y-1.5",
      )}
    >
      <RadixSwitch.Thumb
        className={cn(
          "block size-[27px] rounded-full bg-white shadow-[0_2px_6px_rgb(0_0_0/0.25)]",
          "transition-transform duration-[var(--duration-base)] ease-standard motion-reduce:transition-none",
          "data-[state=checked]:translate-x-5",
        )}
      />
    </RadixSwitch.Root>
  );
  if (!showLabel) return control;
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <span className="flex min-w-0 flex-1 flex-col">
        <label htmlFor={id} className="text-body leading-[22px]">
          {label}
        </label>
        {hint ? (
          <span id={`${id}-hint`} className="text-subhead text-ink-2">
            {hint}
          </span>
        ) : null}
      </span>
      {control}
    </div>
  );
}
