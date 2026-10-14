"use client";

import { ToggleGroup } from "radix-ui";
import { hapticSelection } from "@/lib/telegram/mini-app";
import { cn } from "@/lib/utils";

export type SegmentedOption<T extends string> = { value: T; label: string };

type SegmentedControlProps<T extends string> = {
  /** Two to four views of the same screen. */
  options: readonly SegmentedOption<T>[];
  value: T;
  onValueChange: (value: T) => void;
  /** Name of the group for screen readers. */
  label: string;
  className?: string;
  size?: "md";
};

/**
 * Switches between two to four views of one screen (docs/design/components/SegmentedControl).
 * Exactly one segment is selected at any time, shown by an inverse thumb that slides under the labels.
 *
 * Keyboard follows Radix ToggleGroup: the arrows move focus and Space or Enter selects. Selection does
 * not follow focus on purpose: some switches navigate or reload the page (zone, language), and that
 * must not happen while the user is only moving through the options.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onValueChange,
  label,
  className,
  size = "md",
}: SegmentedControlProps<T>) {
  const index = options.findIndex((option) => option.value === value);

  function select(next: string) {
    // Radix reports "" when the selected segment is pressed again: keep the current one instead.
    const option = options.find((candidate) => candidate.value === next);
    if (!option || option.value === value) return;
    hapticSelection();
    onValueChange(option.value);
  }

  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={select}
      aria-label={label}
      data-size={size}
      className={cn("relative grid h-11 auto-cols-[minmax(0,1fr)] grid-flow-col rounded-sm bg-surface-2 p-[3px]", className)}
    >
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-[3px] left-[3px] rounded-xs bg-inverse transition-transform duration-[var(--duration-base)] ease-standard",
          "motion-reduce:transition-none",
          index < 0 && "opacity-0",
        )}
        style={{
          width: `calc((100% - 6px) / ${options.length})`,
          transform: `translateX(${Math.max(index, 0) * 100}%)`,
        }}
      />
      {options.map((option) => (
        <ToggleGroup.Item
          key={option.value}
          value={option.value}
          className={cn(
            "relative min-w-0 cursor-pointer rounded-xs px-2 text-subhead font-semibold text-ink-2",
            "transition-colors duration-[var(--duration-base)] ease-standard motion-reduce:transition-none",
            "data-[state=on]:text-on-inverse data-[state=off]:hover:bg-surface-3",
            // The visual segment is 38px tall inside the track; the hit area covers the full 44px.
            "before:absolute before:inset-x-0 before:-inset-y-[3px]",
          )}
        >
          <span className="block truncate">{option.label}</span>
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
