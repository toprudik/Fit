"use client";

import { Target } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ChipRadio } from "@/components/ui/chip";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/sonner";
import { useI18n } from "@/i18n/client";
import { interpolate } from "@/i18n/format";
import { setWorkoutWeekGoal } from "@/lib/gamification/actions";
import { WEEK_GOAL_OPTIONS } from "@/lib/gamification/gamification";

/** "Цель на неделю" of the workouts streak, for the client or the trainer of the pair (§2.1-1). */
export function WeekGoalButton({ clientId, current, side }: { clientId: string; current: number; side: "client" | "trainer" }) {
  const { t } = useI18n();
  const copy = t.gamification.goal;
  const [open, setOpen] = useState(false);
  const [goal, setGoal] = useState(current);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const result = await setWorkoutWeekGoal({ clientId, perWeek: goal });
      if (!result.ok) {
        toast.error(copy.failed);
        return;
      }
      setOpen(false);
      toast.success(copy.saved);
    });
  }

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        icon={Target}
        className="self-start"
        onClick={() => {
          setGoal(current);
          setOpen(true);
        }}
      >
        {copy.change}
      </Button>
      <Sheet
        open={open}
        onOpenChange={(next) => !pending && setOpen(next)}
        title={copy.title}
        description={side === "client" ? copy.text : copy.trainerText}
        actions={
          <Button size="lg" block loading={pending} onClick={save}>
            {copy.save}
          </Button>
        }
      >
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 px-1 text-footnote text-ink-2">{copy.label}</legend>
          <div className="flex flex-wrap gap-2">
            {WEEK_GOAL_OPTIONS.map((n) => (
              <ChipRadio key={n} name="week-goal" value={n} checked={goal === n} onChange={() => setGoal(n)}>
                {interpolate(copy.option, { n })}
              </ChipRadio>
            ))}
          </div>
        </fieldset>
      </Sheet>
    </>
  );
}
