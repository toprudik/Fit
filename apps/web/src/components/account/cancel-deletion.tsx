"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { useI18n } from "@/i18n/client";
import { cancelAccountDeletion } from "@/lib/account/actions";

/** "Отменить удаление": the account stays and the app opens again from the start. */
export function CancelDeletion() {
  const { t } = useI18n();
  const copy = t.account.delete;
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function cancel() {
    startTransition(async () => {
      const result = await cancelAccountDeletion();
      if (!result.ok) {
        toast.error(copy.failed);
        return;
      }
      toast.success(copy.cancelled);
      router.replace("/");
    });
  }

  return (
    <Button size="lg" block loading={pending} onClick={cancel}>
      {copy.cancel}
    </Button>
  );
}
