"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { toast } from "@/components/ui/sonner";
import { DateField } from "@/components/ui/date-field";
import { TextField } from "@/components/ui/text-field";
import { useI18n } from "@/i18n/client";
import { grantPlan, type GrantResult } from "@/lib/plans/admin-actions";
import type { PaidPlan } from "@/lib/plans/plans";

type Errors = { expires?: string; reason?: string };

/**
 * "Выдать тариф" in /admin/plans (PLAN-2, §2.14-8): the plan, an optional last day and a required reason.
 * Pro goes only to trainers, so for anyone else the form offers Premium alone.
 */
export function GrantForm({ userId, isTrainer, defaultPlan }: { userId: string; isTrainer: boolean; defaultPlan?: PaidPlan }) {
  const { t } = useI18n();
  const copy = t.adminShell.plans.grant;
  const [plan, setPlan] = useState<PaidPlan>(isTrainer ? (defaultPlan ?? "trainer_pro") : "client_premium");
  const [errors, setErrors] = useState<Errors>({});
  // form.reset() clears native fields only, so the date field starts over with a new key.
  const [granted, setGranted] = useState(0);
  const [pending, startTransition] = useTransition();

  function report(result: GrantResult, form: HTMLFormElement) {
    if (result.status === "reason-required") return setErrors({ reason: copy.reasonEmpty });
    if (result.status === "reason-short") return setErrors({ reason: copy.reasonShort });
    if (result.status === "invalid-expiry") return setErrors({ expires: copy.invalidExpiry });
    setErrors({});
    if (result.status === "done") {
      form.reset();
      setGranted((count) => count + 1);
      toast.success(copy.done);
    } else if (result.status === "already") toast.error(copy.already);
    else if (result.status === "not-trainer") toast.error(copy.notTrainer);
    else toast.error(copy.failed);
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const reason = String(data.get("reason") ?? "").trim();
    if (!reason) return setErrors({ reason: copy.reasonEmpty });
    if (reason.length < 3) return setErrors({ reason: copy.reasonShort });
    const expires = String(data.get("expires") ?? "");
    startTransition(async () => report(await grantPlan({ userId, plan, expires, reason }), form));
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {isTrainer ? (
        <div className="flex flex-col gap-2">
          <p className="text-footnote font-semibold text-ink-2">{copy.plan}</p>
          <SegmentedControl
            label={copy.plan}
            options={[
              { value: "trainer_pro", label: copy.pro },
              { value: "client_premium", label: copy.premium },
            ]}
            value={plan}
            onValueChange={setPlan}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <p className="text-footnote font-semibold text-ink-2">{copy.plan}</p>
          <p className="text-body">{copy.premium}</p>
          <p className="text-footnote text-ink-2">{copy.notTrainerNote}</p>
        </div>
      )}
      <DateField key={granted} name="expires" label={copy.expires} hint={copy.expiresHint} error={errors.expires} />
      <TextField name="reason" label={copy.reasonLabel} hint={copy.reasonHint} error={errors.reason} maxLength={500} autoComplete="off" />
      <div>
        <Button type="submit" loading={pending}>
          {copy.submit}
        </Button>
      </div>
    </form>
  );
}
