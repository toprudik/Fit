"use client";

import Link from "next/link";
import { useState } from "react";
import { GoalPicker } from "@/components/nutrition/goal-picker";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";
import type { Goal } from "@/lib/nutrition/target";

/**
 * "Выбери цель" after the intake (wave-2 §1 rule 4): a pick saves at once through the nutrition goal picker, then
 * "Готово" goes to the trainer's page. The step can be skipped while no goal is chosen.
 */
export function GoalStep({ initial, doneHref }: { initial: Goal | null; doneHref: string }) {
  const { t } = useI18n();
  const copy = t.goalStep;
  const [goal, setGoal] = useState<Goal | null>(initial);
  return (
    <div className="flex flex-col gap-6">
      <GoalPicker goal={goal} onChange={setGoal} activeSource={null} trainerName={null} />
      <div className="flex flex-col gap-2">
        {goal ? (
          <Button asChild size="lg" block>
            <Link href={doneHref}>{copy.done}</Link>
          </Button>
        ) : (
          <Button asChild variant="ghost" size="lg" block>
            <Link href={doneHref}>{copy.skip}</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
