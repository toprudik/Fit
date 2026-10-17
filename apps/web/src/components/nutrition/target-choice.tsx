"use client";

import { useState, useTransition } from "react";
import { ChoiceList } from "@/components/passes/choice-list";
import { toast } from "@/components/ui/sonner";
import { useI18n } from "@/i18n/client";
import { interpolate } from "@/i18n/format";
import { chooseNutritionTarget } from "@/lib/nutrition/actions";
import { formatValue } from "@/lib/progress/measurements";
import type { TrainerTarget } from "@/lib/nutrition/load";

/** Several trainers set a target: the client picks the one the diary uses (wave-2 §2.13). */
export function TargetChoice({ targets }: { targets: TrainerTarget[] }) {
  const { t, locale } = useI18n();
  const copy = t.nutrition;
  const [value, setValue] = useState<string | null>(targets.find((target) => target.active)?.coachingId ?? null);
  const [, startTransition] = useTransition();

  function pick(coachingId: string) {
    const previous = value;
    setValue(coachingId);
    startTransition(async () => {
      const result = await chooseNutritionTarget(coachingId);
      if (!result.ok) {
        setValue(previous);
        toast.error(copy.calc.failed);
        return;
      }
      toast.success(copy.choice.saved);
    });
  }

  return (
    <section className="flex flex-col gap-2" aria-labelledby="target-choice">
      <div className="flex flex-col gap-1 px-4">
        <h2 id="target-choice" className="text-headline">
          {copy.choice.title}
        </h2>
        <p className="text-subhead text-ink-2">{copy.choice.text}</p>
      </div>
      <ChoiceList
        label={copy.choice.title}
        choices={targets.map((target) => ({
          value: target.coachingId,
          title: target.trainerName
            ? interpolate(copy.target.sources.trainer, { name: target.trainerName })
            : copy.target.sources.trainerUnnamed,
          subtitle: interpolate(copy.target.kcal, { value: formatValue(locale, target.macros.kcal) }),
        }))}
        value={value}
        onChange={pick}
      />
    </section>
  );
}
