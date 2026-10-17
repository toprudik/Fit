"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { useI18n } from "@/i18n/client";
import { acceptWaitlistOffer, leaveWaitlist, type BookingError } from "@/lib/bookings/actions";
import { hapticSuccess } from "@/lib/telegram/mini-app";

type Props = {
  entryId: string;
  /** offered: "Занять место" / "Отказаться"; waiting: "Выйти из очереди". */
  status: "waiting" | "offered";
  /** The offer becomes a request, not a confirmed booking (no pass or allowed debt). */
  request: boolean;
};

/** The buttons of /client/waitlist/[entryId] (PRD wave-2 §9): take or decline an offered seat, or leave the queue. */
export function WaitlistActions({ entryId, status, request }: Props) {
  const { t } = useI18n();
  const copy = t.schedule.waitlist;
  const router = useRouter();
  const [error, setError] = useState<BookingError | null>(null);
  const [pending, startTransition] = useTransition();
  const [action, setAction] = useState<"accept" | "leave" | null>(null);

  const accept = () => {
    setAction("accept");
    startTransition(async () => {
      const result = await acceptWaitlistOffer(entryId);
      if (result.status === "error") return setError(result.error);
      hapticSuccess();
      toast.success(result.confirmed ? t.schedule.book.booked : t.schedule.book.requested);
      router.push(`/client/bookings/${result.bookingId}`);
    });
  };

  const leave = () => {
    setAction("leave");
    startTransition(async () => {
      const result = await leaveWaitlist(entryId);
      if (result.status === "error") return setError(result.error);
      toast.success(status === "offered" ? copy.declined : copy.left);
      router.push("/client/book");
    });
  };

  return (
    <div className="flex flex-col gap-2">
      {error ? (
        <p role="alert" className="px-1 text-subhead text-danger">
          {error in copy.errors ? copy.errors[error as keyof typeof copy.errors] : copy.errors.failed}
        </p>
      ) : null}
      {status === "offered" ? (
        <Button type="button" block loading={pending && action === "accept"} disabled={pending} onClick={accept}>
          {request ? copy.acceptRequest : copy.accept}
        </Button>
      ) : null}
      <Button type="button" variant="secondary" block loading={pending && action === "leave"} disabled={pending} onClick={leave}>
        {status === "offered" ? copy.decline : copy.leave}
      </Button>
    </div>
  );
}
