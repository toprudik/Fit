"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { useI18n } from "@/i18n/client";
import { interpolate } from "@/i18n/format";
import { dismissChurn } from "@/lib/trainer-analytics/actions";

/** "Скрыть" on a row of «Под угрозой ухода»: hides the client for 30 days (PRD wave-2 §7 rule 6). */
export function DismissChurn({ coachingId, name }: { coachingId: string; name: string }) {
  const { t } = useI18n();
  const copy = t.trainerAnalytics.churn;
  const [pending, startTransition] = useTransition();

  function hide() {
    startTransition(async () => {
      const result = await dismissChurn(coachingId);
      if (result.status === "done") toast.success(copy.hidden);
      else toast.error(copy.failed);
    });
  }

  return (
    <Button variant="ghost" size="sm" loading={pending} onClick={hide} aria-label={interpolate(copy.hideLabel, { name })}>
      {copy.hide}
    </Button>
  );
}
