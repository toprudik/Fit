"use client";

import { Check } from "lucide-react";
import { useId } from "react";
import { hapticSelection } from "@/lib/telegram/mini-app";
import { cn } from "@/lib/utils";

export type Choice<T extends string> = { value: T; title: string; subtitle?: string };

/**
 * One of a few rows to pick (a package, what a payment is for): native radios, so the keyboard and screen
 * readers work as usual. The picked row is inverse (docs/design.md "Выбор = инверсия").
 */
export function ChoiceList<T extends string>({
  label,
  choices,
  value,
  onChange,
}: {
  label: string;
  choices: Choice<T>[];
  value: T | null;
  onChange: (value: T) => void;
}) {
  const name = useId();
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 px-1 text-footnote text-ink-2">{label}</legend>
      <div className="flex flex-col gap-2">
        {choices.map((choice) => {
          const checked = choice.value === value;
          return (
            <label
              key={choice.value}
              className={cn(
                "flex min-h-13 cursor-pointer items-center gap-3 rounded-md px-4 py-2.5",
                "transition-colors duration-[var(--duration-base)] ease-standard motion-reduce:transition-none",
                "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus-ring",
                checked ? "bg-inverse text-on-inverse" : "bg-surface-2 hover:bg-surface-3",
              )}
            >
              <input
                type="radio"
                name={name}
                value={choice.value}
                checked={checked}
                onChange={() => {
                  hapticSelection();
                  onChange(choice.value);
                }}
                className="sr-only"
              />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-body font-semibold break-words">{choice.title}</span>
                {choice.subtitle ? (
                  <span className={cn("text-footnote tabular-nums", checked ? "opacity-80" : "text-ink-2")}>{choice.subtitle}</span>
                ) : null}
              </span>
              {checked ? <Check aria-hidden size={20} strokeWidth={2} /> : null}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
