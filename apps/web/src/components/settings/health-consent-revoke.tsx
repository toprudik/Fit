"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";
import { revokeHealthConsent, type RevokeState } from "@/lib/consent/settings-actions";

const INITIAL: RevokeState = { failed: false };

/** "Отозвать согласие" for health data (право 5): the first tap asks again, the second revokes. */
export function HealthConsentRevoke() {
  const { t } = useI18n();
  const copy = t.consent.settings;
  const [state, action, pending] = useActionState(revokeHealthConsent, INITIAL);
  const [asking, setAsking] = useState(false);

  if (!asking) {
    return (
      <Button type="button" variant="secondary" block onClick={() => setAsking(true)}>
        {copy.revoke}
      </Button>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-3">
      <p role="status" className="rounded-lg bg-surface-1 p-4 text-subhead text-ink-2">
        {copy.revokeConfirm}
      </p>
      {state.failed ? (
        <p role="alert" className="text-subhead text-danger">
          {copy.failed}
        </p>
      ) : null}
      <Button type="submit" variant="destructive" block loading={pending}>
        {copy.revokeYes}
      </Button>
      <Button type="button" variant="ghost" block onClick={() => setAsking(false)}>
        {copy.keep}
      </Button>
    </form>
  );
}
