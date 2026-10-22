"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { useI18n } from "@/i18n/client";
import { interpolate } from "@/i18n/format";
import { decideRequest } from "@/lib/bookings/actions";

/**
 * «Подтвердить» right in the list of requests (QA U6): one tap instead of opening each request. Declining, with its
 * reason, and confirming as a single session stay inside the request.
 */
export function QuickConfirm({ bookingId, client }: { bookingId: string; client: string }) {
  const { t } = useI18n();
  const copy = t.schedule.requests;
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      loading={pending}
      aria-label={interpolate(copy.confirmFor, { name: client })}
      onClick={() =>
        startTransition(async () => {
          const result = await decideRequest({ bookingId, accept: true, reason: "" });
          if (result.status === "done") toast.success(copy.confirmed);
          else toast.error(copy.errors[result.error === "request_not_found" ? "request_not_found" : "failed"]);
        })
      }
    >
      {copy.confirm}
    </Button>
  );
}
