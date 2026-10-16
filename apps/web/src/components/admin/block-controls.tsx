"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { TextField } from "@/components/ui/text-field";
import { useI18n } from "@/i18n/client";
import { blockUser, unblockUser, type BlockResult } from "@/lib/admin/user-actions";

/**
 * "Заблокировать" / "Разблокировать" on the user card (ADM-7). Both ask for a reason first: it goes to the
 * card and the audit log, never to the user.
 */
export function BlockControls({ userId, blocked }: { userId: string; blocked: boolean }) {
  const { t } = useI18n();
  const copy = t.adminShell.card.block;
  const [open, setOpen] = useState(false);
  const [reasonError, setReasonError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  function report(result: BlockResult) {
    if (result.status === "reason-required") {
      setReasonError(copy.reasonEmpty);
      return;
    }
    setOpen(false);
    if (result.status === "done") toast.success(blocked ? copy.unblocked : copy.blocked);
    else if (result.status === "already") toast.error(blocked ? copy.alreadyUnblocked : copy.alreadyBlocked);
    else if (result.status === "admin") toast.error(copy.admin);
    else if (result.status === "self") toast.error(copy.self);
    else toast.error(copy.failed);
  }

  function submit(formData: FormData) {
    const reason = String(formData.get("reason") ?? "").trim();
    if (!reason) {
      setReasonError(copy.reasonEmpty);
      return;
    }
    setReasonError(undefined);
    startTransition(async () => report(await (blocked ? unblockUser : blockUser)({ userId, reason })));
  }

  if (!open) {
    return (
      <div>
        <Button size="sm" variant={blocked ? "secondary" : "destructive"} onClick={() => setOpen(true)}>
          {blocked ? copy.unblock : copy.action}
        </Button>
      </div>
    );
  }
  return (
    <form action={submit} noValidate className="flex flex-col gap-3">
      <TextField name="reason" label={copy.reasonLabel} hint={copy.reasonHint} error={reasonError} maxLength={500} autoComplete="off" autoFocus />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" variant={blocked ? "primary" : "destructive"} loading={pending}>
          {blocked ? copy.confirmUnblock : copy.confirm}
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
          {copy.cancel}
        </Button>
      </div>
    </form>
  );
}
