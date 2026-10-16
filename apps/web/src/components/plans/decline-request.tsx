"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { useI18n } from "@/i18n/client";
import { declineAccessRequest } from "@/lib/plans/admin-actions";

/** "Отклонить" in the request queue. The person is not told: they may ask again the next day. */
export function DeclineRequest({ requestId }: { requestId: string }) {
  const { t } = useI18n();
  const copy = t.adminShell.plans;
  const [pending, startTransition] = useTransition();

  function decline() {
    startTransition(async () => {
      const result = await declineAccessRequest({ requestId });
      if (result.status === "done") toast.success(copy.requests.declined);
      else if (result.status === "not-open") toast.error(copy.requests.notOpen);
      else toast.error(copy.grant.failed);
    });
  }

  return (
    <Button size="sm" variant="ghost" loading={pending} onClick={decline}>
      {copy.requests.decline}
    </Button>
  );
}
