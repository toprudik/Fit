"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { useI18n } from "@/i18n/client";
import { interpolate } from "@/i18n/format";
import { setIntakeShare } from "@/lib/intake/actions";

/** Whether this pair's trainer sees the intake, with the switch next to it on the intake page. */
export function IntakeShareToggle({ coachingId, shared, trainerName }: { coachingId: string; shared: boolean; trainerName: string }) {
  const { t } = useI18n();
  const copy = t.intake.form;
  const [pending, startTransition] = useTransition();

  function toggle() {
    startTransition(async () => {
      const { failed } = await setIntakeShare(coachingId, !shared);
      if (failed) toast.error(copy.shareFailed);
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-surface-1 p-4">
      <p className="text-subhead">{interpolate(shared ? copy.shown : copy.hidden, { name: trainerName })}</p>
      <Button type="button" variant="secondary" onClick={toggle} loading={pending} className="self-start">
        {shared ? copy.hideFromTrainer : copy.showToTrainer}
      </Button>
    </div>
  );
}
