"use client";

import { useActionState } from "react";
import { redeemTrainerInvite, type RedeemState } from "@/lib/trainer-invites/redeem-action";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";

const INITIAL: RedeemState = { failed: false };

/** "Стать тренером" for a code the server found valid. */
export function RedeemButton({ code }: { code: string }) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState(redeemTrainerInvite, INITIAL);

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="code" value={code} />
      {state.failed ? (
        <p role="alert" className="text-subhead text-danger">
          {t.trainerInvite.failed}
        </p>
      ) : null}
      <Button type="submit" size="lg" block loading={pending}>
        {t.trainerInvite.become}
      </Button>
    </form>
  );
}
