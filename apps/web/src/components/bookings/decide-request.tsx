"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/sonner";
import { TextArea } from "@/components/ui/text-area";
import { useI18n } from "@/i18n/client";
import { decideRequest, type BookingError } from "@/lib/bookings/actions";
import { confirmRequestSingle } from "@/lib/bookings/single";

/**
 * "Подтвердить" and "Отклонить" with an optional reason on /trainer/requests/[id] (PRD 2.6.4); with `single`, when
 * no pass covers the request, also "Подтвердить как разовое" (2.6.4-6, 2.8-12).
 */
export function DecideRequest({ bookingId, single = false }: { bookingId: string; single?: boolean }) {
  const { t } = useI18n();
  const copy = t.schedule.requests;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [action, setAction] = useState<"accept" | "single" | "decline" | null>(null);

  const explain = (code: BookingError) => copy.errors[code === "request_not_found" || code === "invalid_reason" ? code : "failed"];

  const decide = (accept: boolean) => {
    setAction(accept ? "accept" : "decline");
    startTransition(async () => {
      const result = await decideRequest({ bookingId, accept, reason: accept ? "" : reason });
      if (result.status === "done") {
        setOpen(false);
        toast.success(accept ? copy.confirmed : copy.declined);
        router.push("/trainer/requests");
        return;
      }
      if (accept) toast.error(explain(result.error));
      else setError(explain(result.error));
    });
  };

  const confirmSingle = () => {
    setAction("single");
    startTransition(async () => {
      const result = await confirmRequestSingle({ bookingId, title: t.schedule.sessionForm.singleTitle });
      if (result.status === "error") {
        toast.error(explain(result.error));
        return;
      }
      toast.success(copy.confirmedSingle);
      router.push("/trainer/requests");
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" block loading={pending && action === "accept"} onClick={() => decide(true)}>
        {copy.confirm}
      </Button>
      {single ? (
        <>
          <Button type="button" variant="secondary" block loading={pending && action === "single"} onClick={confirmSingle}>
            {copy.confirmSingle}
          </Button>
          <p className="px-1 text-footnote text-ink-2">{copy.confirmSingleHint}</p>
        </>
      ) : null}
      <Button type="button" variant="secondary" block onClick={() => setOpen(true)}>
        {copy.decline}
      </Button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={copy.declineTitle}
        description={copy.declineText}
        actions={
          <>
            <Button type="button" variant="destructive" block loading={pending && action === "decline"} onClick={() => decide(false)}>
              {copy.declineConfirm}
            </Button>
            <Button type="button" variant="secondary" block onClick={() => setOpen(false)}>
              {copy.keep}
            </Button>
          </>
        }
      >
        <TextArea
          label={copy.reason}
          hint={copy.reasonHint}
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
    </div>
  );
}
