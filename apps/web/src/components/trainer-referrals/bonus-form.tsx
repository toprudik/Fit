"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { toast } from "@/components/ui/sonner";
import { TextField } from "@/components/ui/text-field";
import { useI18n } from "@/i18n/client";
import { type BonusFormState, saveTrainerReferralBonus } from "@/lib/trainer-referrals/actions";
import type { TrainerReferralBonus } from "@/lib/trainer-referrals/load";

const IDLE: BonusFormState = { status: "idle" };

type Kind = TrainerReferralBonus["kind"];

/** The admin's choice of the bonus for an invited trainer (PRD wave-3 §3.2-12): a month of Pro or a discount. */
export function TrainerReferralBonusForm({ bonus }: { bonus: TrainerReferralBonus | null }) {
  const { t } = useI18n();
  const copy = t.trainerReferrals.admin;
  const [state, action, pending] = useActionState(saveTrainerReferralBonus, IDLE);
  const [kind, setKind] = useState<Kind>(
    state.status === "invalid" || (state.status === "failed" && state.kind === "plan_discount")
      ? "plan_discount"
      : (bonus?.kind ?? "plan_month"),
  );
  const percent =
    state.status === "invalid" || state.status === "failed"
      ? state.percent
      : bonus?.kind === "plan_discount"
        ? String(bonus.percent)
        : "";

  useEffect(() => {
    if (state.status === "saved") toast.success(copy.saved);
  }, [state, copy.saved]);

  return (
    <form key={JSON.stringify(state)} action={action} className="flex flex-col gap-4">
      <p className="text-subhead text-ink-2">{copy.text}</p>
      <input type="hidden" name="kind" value={kind} />
      <SegmentedControl
        label={copy.kind}
        value={kind}
        onValueChange={setKind}
        options={[
          { value: "plan_month", label: copy.month },
          { value: "plan_discount", label: copy.discount },
        ]}
      />
      {kind === "plan_discount" ? (
        <TextField
          label={copy.percent}
          name="percent"
          inputMode="numeric"
          defaultValue={percent}
          suffix="%"
          error={state.status === "invalid" ? copy.percentError : undefined}
        />
      ) : null}
      {state.status === "failed" ? (
        <p role="alert" className="text-subhead text-danger">
          {copy.failed}
        </p>
      ) : null}
      <Button type="submit" block loading={pending}>
        {copy.save}
      </Button>
    </form>
  );
}
