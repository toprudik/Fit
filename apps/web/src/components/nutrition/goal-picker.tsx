"use client";

import { useState, useTransition } from "react";
import { ChipRadio } from "@/components/ui/chip";
import { toast } from "@/components/ui/sonner";
import { useI18n } from "@/i18n/client";
import { interpolate } from "@/i18n/format";
import { setNutritionGoal } from "@/lib/nutrition/actions";
import { GOALS, type Goal } from "@/lib/nutrition/target";

/**
 * "Цель" on its own (wave-2 §1.1): a pick saves at once. The target does not move: a calculator target waits for a
 * new calculation the client confirms, a trainer's target stays and the trainer is told (§1.3).
 */
export function GoalPicker({
  goal,
  onChange,
  activeSource,
  trainerName,
}: {
  goal: Goal | null;
  onChange: (goal: Goal) => void;
  activeSource: "calculator" | "trainer" | "group" | null;
  trainerName: string | null;
}) {
  const { t } = useI18n();
  const copy = t.nutrition.goalPicker;
  const [changed, setChanged] = useState(false);
  const [pending, startTransition] = useTransition();

  function pick(next: Goal) {
    if (next === goal || pending) return;
    const previous = goal;
    onChange(next);
    startTransition(async () => {
      const response = await setNutritionGoal(next);
      if (!response.ok) {
        if (previous) onChange(previous);
        toast.error(copy.failed);
        return;
      }
      setChanged(true);
      toast.success(copy.saved);
    });
  }

  const note = !changed
    ? null
    : activeSource === "calculator"
      ? copy.recalculate
      : activeSource !== null && trainerName
        ? interpolate(copy.trainerKeeps, { name: trainerName })
        : null;

  return (
    <section aria-labelledby="nutrition-goal" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1 px-4">
        <h2 id="nutrition-goal" className="text-headline">
          {t.nutrition.goalLabel}
        </h2>
        <p className="text-subhead text-ink-2">{copy.text}</p>
      </div>
      <fieldset className="flex flex-wrap gap-2 px-4" aria-labelledby="nutrition-goal" aria-busy={pending}>
        {GOALS.map((value) => (
          <ChipRadio key={value} name="goal" value={value} checked={goal === value} onChange={() => pick(value)}>
            {t.nutrition.goals[value]}
          </ChipRadio>
        ))}
      </fieldset>
      {note ? (
        <p role="status" className="px-4 text-footnote text-ink-2">
          {note}
        </p>
      ) : null}
    </section>
  );
}
