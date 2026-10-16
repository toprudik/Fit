"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { TextField } from "@/components/ui/text-field";
import { useI18n } from "@/i18n/client";
import { decideVerification, type DecideResult } from "@/lib/verification/admin-actions";

/** "Верифицировать" right away; "Отклонить" asks for the reason the trainer will see (ADM-5). */
export function DecisionControls({ trainerId }: { trainerId: string }) {
  const { t } = useI18n();
  const copy = t.verification.admin;
  const [rejecting, setRejecting] = useState(false);
  const [reasonError, setReasonError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  function report(result: DecideResult, done: string) {
    if (result.status === "done") toast.success(done);
    else if (result.status === "already-decided") toast.error(copy.alreadyDecided);
    else if (result.status === "reason-required") setReasonError(copy.reasonEmpty);
    else toast.error(copy.failed);
  }

  function verify() {
    startTransition(async () => report(await decideVerification({ trainerId, decision: "verified" }), copy.verified));
  }

  function reject(formData: FormData) {
    const reason = String(formData.get("reason") ?? "").trim();
    if (!reason) {
      setReasonError(copy.reasonEmpty);
      return;
    }
    setReasonError(undefined);
    startTransition(async () => report(await decideVerification({ trainerId, decision: "rejected", reason }), copy.rejected));
  }

  if (!rejecting) {
    return (
      <div className="flex flex-wrap gap-2">
        <Button size="sm" loading={pending} onClick={verify}>
          {copy.verify}
        </Button>
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => setRejecting(true)}>
          {copy.reject}
        </Button>
      </div>
    );
  }
  return (
    <form action={reject} noValidate className="flex flex-col gap-3">
      <TextField name="reason" label={copy.reasonLabel} hint={copy.reasonHint} error={reasonError} maxLength={1000} autoComplete="off" autoFocus />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" variant="destructive" loading={pending}>
          {copy.confirmReject}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => {
            setRejecting(false);
            setReasonError(undefined);
          }}
        >
          {copy.cancel}
        </Button>
      </div>
    </form>
  );
}
