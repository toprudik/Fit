"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/sonner";
import { useI18n } from "@/i18n/client";
import { withdrawRequest } from "@/lib/bookings/actions";

/** "Отозвать запрос" (PRD 2.6.5-6): any time, without consequences. */
export function WithdrawRequest({ bookingId }: { bookingId: string }) {
  const { t } = useI18n();
  const copy = t.schedule.booking;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const confirm = () =>
    startTransition(async () => {
      const result = await withdrawRequest(bookingId);
      if (result.status === "done") {
        setOpen(false);
        toast.success(copy.withdrawn);
        router.push("/client/sessions");
        return;
      }
      setError(copy.errors[result.error === "request_not_found" ? "request_not_found" : "failed"]);
    });

  return (
    <>
      <Button type="button" variant="secondary" block onClick={() => setOpen(true)}>
        {copy.withdraw}
      </Button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={copy.withdrawTitle}
        description={copy.withdrawText}
        actions={
          <>
            <Button type="button" variant="destructive" block loading={pending} onClick={confirm}>
              {copy.withdrawConfirm}
            </Button>
            <Button type="button" variant="secondary" block onClick={() => setOpen(false)}>
              {copy.keep}
            </Button>
          </>
        }
      >
        {error ? (
          <p role="alert" className="text-subhead text-danger">
            {error}
          </p>
        ) : null}
      </Sheet>
    </>
  );
}
