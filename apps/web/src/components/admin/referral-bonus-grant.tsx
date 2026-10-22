"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { DateField } from "@/components/ui/date-field";
import { useI18n } from "@/i18n/client";
import { grantReferralBonus, type GrantReferralBonusResult } from "@/lib/referral-bonuses/actions";
import { BONUS_DEFAULT_START } from "@/lib/referral-bonuses/bonuses";

/** «Выдать месяц Pro после беты» for one due bonus: the first day of the month, the first day after the beta by default. */
export function ReferralBonusGrant({ bonusId }: { bonusId: string }) {
  const { t } = useI18n();
  const copy = t.adminReferralBonuses;
  const [startError, setStartError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  function report(result: GrantReferralBonusResult) {
    if (result.status === "invalid-start") return setStartError(copy.errors.invalidStart);
    setStartError(undefined);
    if (result.status === "done") toast.success(copy.done);
    else if (result.status === "not-due") toast.error(copy.errors.notDue);
    else if (result.status === "not-pending") toast.error(copy.errors.notPending);
    else if (result.status === "unsupported") toast.error(copy.errors.unsupported);
    else toast.error(copy.errors.failed);
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const startsOn = String(new FormData(event.currentTarget).get("startsOn") ?? "");
    startTransition(async () => report(await grantReferralBonus({ bonusId, startsOn })));
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3 sm:flex-row sm:items-start">
      <DateField
        name="startsOn"
        label={copy.start}
        hint={copy.startHint}
        defaultValue={BONUS_DEFAULT_START}
        error={startError}
        className="sm:max-w-56"
      />
      <Button type="submit" loading={pending} className="sm:mt-6">
        {copy.submit}
      </Button>
    </form>
  );
}
