"use client";

import { useState, useTransition } from "react";
import { ListGroup, ListRow } from "@/components/ui/list";
import { toast } from "@/components/ui/sonner";
import { useI18n } from "@/i18n/client";
import { shareMonthlyReport } from "@/lib/monthly-report/actions";
import type { ShareTarget } from "@/lib/monthly-report/report";

/**
 * "Отправить тренеру" under a monthly report (PRD wave-3 §4 rule 3): one row per live pair. A tap sends the month
 * to that trainer; a row already sent can be sent again to refresh the trainer's copy.
 */
export function ForwardToTrainer({ month, targets }: { month: string; targets: ShareTarget[] }) {
  const { t } = useI18n();
  const copy = t.monthlyReport.forward;
  const [sent, setSent] = useState(() => new Set(targets.filter((target) => target.sharedAt).map((target) => target.coachingId)));
  const [pending, startTransition] = useTransition();

  if (!targets.length) return null;

  function send(coachingId: string) {
    startTransition(async () => {
      const result = await shareMonthlyReport({ month, coachingId });
      if (result.status !== "sent") {
        toast.error(copy.failed);
        return;
      }
      setSent((current) => new Set(current).add(coachingId));
      toast.success(copy.done);
    });
  }

  return (
    <ListGroup header={copy.header} footer={copy.footer}>
      {targets.map((target) => {
        const name = target.name ?? t.monthlyReport.sessions.unnamed;
        return (
          <ListRow
            key={target.coachingId}
            avatar={{ name }}
            title={name}
            value={sent.has(target.coachingId) ? copy.sent : copy.send}
            onClick={pending ? undefined : () => send(target.coachingId)}
          />
        );
      })}
    </ListGroup>
  );
}
