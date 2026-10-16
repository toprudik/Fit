"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { useI18n } from "@/i18n/client";
import { revokeTrainerInvite } from "@/lib/trainer-invites/admin-actions";

/** "Отозвать" with a second press to confirm: a revoked invite cannot come back. */
export function RevokeInviteButton({ inviteId }: { inviteId: string }) {
  const { t } = useI18n();
  const copy = t.admin.invites.revoke;
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  function revoke() {
    startTransition(async () => {
      const { ok } = await revokeTrainerInvite(inviteId);
      if (ok) toast.success(copy.done);
      else toast.error(copy.failed);
      setConfirming(false);
    });
  }

  if (!confirming) {
    return (
      <Button size="sm" variant="secondary" className="self-start" onClick={() => setConfirming(true)}>
        {copy.action}
      </Button>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="destructive" loading={pending} onClick={revoke}>
        {copy.confirm}
      </Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => setConfirming(false)}>
        {copy.cancel}
      </Button>
    </div>
  );
}
