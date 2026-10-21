"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";
import { revokePublicDataConsent, type RevokeState } from "@/lib/consent/settings-actions";
import type { PublicScope } from "@/lib/public-data/consent";

const INITIAL: RevokeState = { failed: false };

/** "Отозвать согласие" to publish the showcase or story cards (152-FZ art. 10.1): the first tap asks again. */
export function PublicConsentRevoke({ scope }: { scope: PublicScope }) {
  const { t } = useI18n();
  const copy = t.consent.settings;
  const [state, action, pending] = useActionState(() => revokePublicDataConsent(scope), INITIAL);
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
        {scope === "showcase" ? copy.revokeShowcaseConfirm : copy.revokeStoryConfirm}
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
