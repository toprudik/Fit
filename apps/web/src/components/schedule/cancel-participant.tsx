"use client";

import { UserMinus } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/sonner";
import { TextArea } from "@/components/ui/text-area";
import { useI18n } from "@/i18n/client";
import { interpolate } from "@/i18n/format";
import { cancelParticipant } from "@/lib/schedule/session-actions";

/** "Убрать с занятия" (PRD 2.6.3-4): one participant off a group session, with a reason the client sees, no charge. */
export function CancelParticipant({ bookingId, name }: { bookingId: string; name: string }) {
  const { t } = useI18n();
  const copy = t.schedule.groupSession;
  const page = t.schedule.sessionPage;
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const confirm = () => {
    if (!reason.trim()) return setError(page.reasonRequired);
    startTransition(async () => {
      const result = await cancelParticipant({ bookingId, reason });
      if (result.status === "done") {
        setOpen(false);
        toast.success(copy.removed);
        return;
      }
      if (result.error === "reason_required") setError(page.reasonRequired);
      else if (result.error === "booking_not_found") setError(copy.errors.session_not_found);
      else setError(copy.errors.failed);
    });
  };

  return (
    <>
      <IconButton icon={UserMinus} label={interpolate(copy.removeLabel, { name })} onClick={() => setOpen(true)} />
      <Sheet
        open={open}
        onOpenChange={(next) => !pending && setOpen(next)}
        title={interpolate(copy.removeTitle, { name })}
        description={copy.removeText}
        actions={
          <>
            <Button type="button" variant="destructive" block loading={pending} onClick={confirm}>
              {copy.remove}
            </Button>
            <Button type="button" variant="secondary" block onClick={() => setOpen(false)}>
              {page.keep}
            </Button>
          </>
        }
      >
        <TextArea
          label={page.reason}
          hint={page.reasonHint}
          error={error ?? undefined}
          rows={3}
          maxLength={500}
          value={reason}
          onChange={(event) => {
            setReason(event.target.value);
            setError(null);
          }}
        />
      </Sheet>
    </>
  );
}
