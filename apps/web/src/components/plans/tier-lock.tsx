"use client";

import { Lock } from "lucide-react";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { useI18n } from "@/i18n/client";
import { PLAN_TIER, type FeatureCode, type PaidPlan } from "@/lib/plans/plans";
import { requestAccess } from "@/lib/plans/request-access";
import { cn } from "@/lib/utils";

type TierLockProps = {
  /** The plan that opens the feature. */
  plan: PaidPlan;
  /** The feature's name. */
  title: string;
  /** What it gives the person, in one sentence. */
  description?: string;
  /** The feature code saved with the request, so admins see what the person tried to open. */
  feature?: FeatureCode;
  /** A request is already open or was made today: the button says so and stays off. */
  requested?: boolean;
  className?: string;
};

/**
 * A feature of a higher plan (docs/design/components/TierLock, PRD §2.14-7): shown with a lock, the Pro or
 * Premium badge and "Запросить доступ". The beta has no prices; the button sends a request to the admins.
 */
export function TierLock({ plan, title, description, feature, requested = false, className }: TierLockProps) {
  const { t } = useI18n();
  const copy = t.plans.lock;
  const tier = PLAN_TIER[plan];
  const [sent, setSent] = useState(requested);
  const [pending, startTransition] = useTransition();

  function request() {
    startTransition(async () => {
      const result = await requestAccess({ plan, feature });
      if (result.status === "done") {
        setSent(true);
        toast.success(copy.sent);
      } else {
        toast.error(copy.failed);
      }
    });
  }

  return (
    <div data-slot="tier-lock" className={cn("flex items-start gap-3 rounded-lg bg-surface-1 p-4", className)}>
      <div aria-hidden className="grid size-10 shrink-0 place-items-center rounded-sm bg-surface-2 text-ink-2">
        <Lock size={20} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="flex flex-wrap items-center gap-2 text-headline">
          {title}
          <Badge tone={tier}>{t.plans.names[plan]}</Badge>
        </p>
        {description ? <p className="mb-2 text-callout text-ink-2">{description}</p> : null}
        <div>
          <Button size="sm" variant="secondary" loading={pending} disabled={sent} onClick={request}>
            {sent ? copy.requested : copy.request}
          </Button>
        </div>
      </div>
    </div>
  );
}
