"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { useI18n } from "@/i18n/client";
import { remindIntake } from "@/lib/intake/actions";
import { hapticSuccess } from "@/lib/telegram/mini-app";

/** "Напомнить": one message to the client a day; a second press the same day says so instead. */
export function RemindIntakeButton({ coachingId }: { coachingId: string }) {
  const { t } = useI18n();
  const copy = t.intake.trainer;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  function remind() {
    startTransition(async () => {
      const { status } = await remindIntake(coachingId);
      if (status === "sent") {
        hapticSuccess();
        toast.success(copy.reminded);
        setDone(true);
      } else if (status === "already") {
        toast(copy.alreadyReminded);
        setDone(true);
      } else if (status === "failed") {
        toast.error(copy.remindFailed);
      } else {
        // The client filled in or hid the intake meanwhile: show the page as it is now.
        router.refresh();
      }
    });
  }

  return (
    <Button type="button" variant="secondary" onClick={remind} loading={pending} disabled={done}>
      {done ? copy.reminded : copy.remind}
    </Button>
  );
}
