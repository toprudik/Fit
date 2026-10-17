"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/sonner";
import { TextArea } from "@/components/ui/text-area";
import { useI18n } from "@/i18n/client";
import { interpolate } from "@/i18n/format";
import { cancelBooking, previewCancel, type CancelCharge } from "@/lib/bookings/changes";
import { formatMoney } from "@/lib/money/format";

type CancelBookingProps = {
  bookingId: string;
  /** The free cancellation is over when the page renders: the sheet warns about the charge from the start. */
  late: boolean;
  /** "16 октября, 18:00": when the free cancellation ends or ended; null when the trainer set no deadline. */
  deadline: string | null;
  /** Opens the sheet on the first render (the bot's «Отменить»). */
  defaultOpen?: boolean;
};

/**
 * "Отменить запись" (PRD 2.6.5): free before the trainer's deadline, after it with a charge the client agrees to.
 * If the deadline passes while the sheet is open, the server says so and the sheet switches to the late warning.
 */
export function CancelBooking({ bookingId, late: lateAtRender, deadline, defaultOpen = false }: CancelBookingProps) {
  const { t, locale } = useI18n();
  const copy = t.schedule.booking;
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  const [late, setLate] = useState(lateAtRender);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [charge, setCharge] = useState<CancelCharge | null>(null);
  const [, startPreview] = useTransition();
  const loadCharge = () => startPreview(async () => setCharge(await previewCancel(bookingId)));
  // Opened from the bot after the deadline: show what the cancellation costs, as a tap on the button would.
  useEffect(() => {
    if (defaultOpen && lateAtRender) startPreview(async () => setCharge(await previewCancel(bookingId)));
  }, [bookingId, defaultOpen, lateAtRender]);

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
        loadCharge();
        return;
      }
      setError(copy.errors[result.error]);
    });

  const deadlineText = deadline ? interpolate(copy.cancelLateText, { date: deadline }) : copy.cancelLateTextNoDate;
  const chargeText =
    charge?.kind === "pass"
      ? interpolate(copy.chargePass, { pass: charge.passTitle, count: charge.sessionsLeft })
      : charge?.kind === "debt"
        ? interpolate(copy.chargeDebt, { amount: formatMoney(locale, charge.amountMinor, charge.currency) })
        : null;
  const free = charge?.kind === "free";
  const lateText = free ? copy.chargeFree : [deadlineText, chargeText].filter(Boolean).join(" ");

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        block
        onClick={() => {
          setOpen(true);
          if (late) loadCharge();
        }}
      >
        {lateAtRender ? copy.cancelLate : copy.cancel}
      </Button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={late && !free ? copy.cancelLateTitle : copy.cancelTitle}
        description={late ? lateText : copy.cancelFreeText}
        actions={
          <>
            <Button type="button" variant="destructive" block loading={pending} onClick={confirm}>
              {late && !free ? copy.cancelLateConfirm : copy.cancelConfirm}
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
