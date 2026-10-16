"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/sonner";
import { TextArea } from "@/components/ui/text-area";
import { useI18n } from "@/i18n/client";
import { interpolate } from "@/i18n/format";
import { cancelBooking } from "@/lib/bookings/changes";

type CancelBookingProps = {
  bookingId: string;
  /** The free cancellation is over when the page renders: the sheet warns about the charge from the start. */
  late: boolean;
  /** "16 октября, 18:00": when the free cancellation ends or ended; null when the trainer set no deadline. */
  deadline: string | null;
};

/**
 * "Отменить запись" (PRD 2.6.5): free before the trainer's deadline, after it with a charge the client agrees to.
 * If the deadline passes while the sheet is open, the server says so and the sheet switches to the late warning.
 */
export function CancelBooking({ bookingId, late: lateAtRender, deadline }: CancelBookingProps) {
  const { t } = useI18n();
  const copy = t.schedule.booking;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [late, setLate] = useState(lateAtRender);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const confirm = () =>
    startTransition(async () => {
      const result = await cancelBooking({ bookingId, reason, late });
      if (result.status === "done") {
        setOpen(false);
        toast.success(result.late ? copy.lateCancelled : copy.cancelled);
        router.push("/client/sessions");
        return;
      }
      if (result.error === "late_cancel") {
        setLate(true);
        setError(null);
        return;
      }
      setError(copy.errors[result.error]);
    });

  const lateText = deadline ? interpolate(copy.cancelLateText, { date: deadline }) : copy.cancelLateTextNoDate;

  return (
    <>
      <Button type="button" variant="secondary" block onClick={() => setOpen(true)}>
        {lateAtRender ? copy.cancelLate : copy.cancel}
      </Button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={late ? copy.cancelLateTitle : copy.cancelTitle}
        description={late ? lateText : copy.cancelFreeText}
        actions={
          <>
            <Button type="button" variant="destructive" block loading={pending} onClick={confirm}>
              {late ? copy.cancelLateConfirm : copy.cancelConfirm}
            </Button>
            <Button type="button" variant="secondary" block onClick={() => setOpen(false)}>
              {copy.keepBooking}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <TextArea
            label={copy.cancelReason}
            hint={copy.cancelReasonHint}
            rows={3}
            maxLength={500}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          {error ? (
            <p role="alert" className="text-subhead text-danger">
              {error}
            </p>
          ) : null}
        </div>
      </Sheet>
    </>
  );
}
