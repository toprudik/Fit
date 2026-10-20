"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ListRow } from "@/components/ui/list";
import { toast } from "@/components/ui/sonner";
import { TextField } from "@/components/ui/text-field";
import { useI18n } from "@/i18n/client";
import { setTrainerHonor, type HonorResult } from "@/lib/admin/honor-actions";
import type { TrainerHonor } from "@/lib/trainer-honors/honors";

/**
 * One showcase honor on the user card with "Выдать" / "Снять". Both ask for a reason first, which goes to the card
 * and the audit log; the form takes the row's place while it is open.
 */
export function TrainerHonorRow({
  trainerId,
  honor,
  held,
  title,
  subtitle,
}: {
  trainerId: string;
  honor: TrainerHonor;
  held: boolean;
  title: string;
  subtitle?: string;
}) {
  const { t } = useI18n();
  const copy = t.trainerHonors.admin;
  const [open, setOpen] = useState(false);
  const [reasonError, setReasonError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  function report(result: HonorResult) {
    if (result.status === "reason-required") {
      setReasonError(copy.reasonEmpty);
      return;
    }
    setOpen(false);
    if (result.status === "done") toast.success(held ? copy.revoked : copy.granted);
    else if (result.status === "unchanged") toast.error(copy.unchanged);
    else toast.error(copy.failed);
  }

  function submit(formData: FormData) {
    const reason = String(formData.get("reason") ?? "").trim();
    if (!reason) {
      setReasonError(copy.reasonEmpty);
      return;
    }
    setReasonError(undefined);
    startTransition(async () => report(await setTrainerHonor({ trainerId, honor, on: !held, reason })));
  }

  if (!open) {
    return (
      <ListRow
        title={title}
        subtitle={subtitle}
        trailing={
          <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
            {held ? copy.revoke : copy.grant}
          </Button>
        }
      />
    );
  }
  return (
    <form action={submit} noValidate className="flex flex-col gap-3 p-4">
      <p className="text-headline">{title}</p>
      <TextField name="reason" label={copy.reasonLabel} hint={copy.reasonHint} error={reasonError} maxLength={500} autoComplete="off" autoFocus />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" loading={pending}>
          {held ? copy.confirmRevoke : copy.confirmGrant}
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
