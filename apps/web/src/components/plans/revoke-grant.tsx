"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { TextField } from "@/components/ui/text-field";
import { useI18n } from "@/i18n/client";
import { revokePlan, type RevokeResult } from "@/lib/plans/admin-actions";

/** "Отозвать" on an active grant: asks for a reason first, like the block on the user card. */
export function RevokeGrant({ grantId }: { grantId: string }) {
  const { t } = useI18n();
  const copy = t.adminShell.plans;
  const [open, setOpen] = useState(false);
  const [reasonError, setReasonError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  function report(result: RevokeResult) {
    if (result.status === "reason-required") return setReasonError(copy.grant.reasonEmpty);
    if (result.status === "reason-short") return setReasonError(copy.grant.reasonShort);
    setOpen(false);
    if (result.status === "done") toast.success(copy.revoke.done);
    else if (result.status === "not-active") toast.error(copy.revoke.notActive);
    else toast.error(copy.grant.failed);
  }

  function submit(formData: FormData) {
    const reason = String(formData.get("reason") ?? "").trim();
    if (!reason) return setReasonError(copy.grant.reasonEmpty);
    if (reason.length < 3) return setReasonError(copy.grant.reasonShort);
    setReasonError(undefined);
    startTransition(async () => report(await revokePlan({ grantId, reason })));
  }

  if (!open) {
    return (
      <div>
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
          {copy.revoke.action}
        </Button>
      </div>
    );
  }
  return (
    <form action={submit} noValidate className="flex flex-col gap-3">
      <TextField
        name="reason"
        label={copy.grant.reasonLabel}
        hint={copy.grant.reasonHint}
        error={reasonError}
        maxLength={500}
        autoComplete="off"
        autoFocus
      />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" variant="destructive" loading={pending}>
          {copy.revoke.confirm}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => {
            setOpen(false);
            setReasonError(undefined);
          }}
        >
          {copy.revoke.cancel}
        </Button>
      </div>
    </form>
  );
}
