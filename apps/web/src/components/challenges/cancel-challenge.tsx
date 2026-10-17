"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/sonner";
import { useI18n } from "@/i18n/client";
import { interpolate } from "@/i18n/format";
import { cancelChallenge } from "@/lib/challenges/actions";

/** "Отменить челлендж" after a confirmation: it stops and nobody gets its badges. */
export function CancelChallengeButton({ challengeId, title }: { challengeId: string; title: string }) {
  const { t } = useI18n();
  const copy = t.challenges.trainer;
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)}>
        {copy.cancel}
      </Button>
      <Sheet
        open={open}
        onOpenChange={(next) => !pending && setOpen(next)}
        title={interpolate(copy.cancelTitle, { title })}
        description={copy.cancelText}
        actions={
          <Button
            variant="destructive"
            size="lg"
            block
            loading={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await cancelChallenge(challengeId);
                if (!result.ok) {
                  toast.error(t.challenges.form.failed);
                  return;
                }
                toast.success(copy.cancelled);
                setOpen(false);
              })
            }
          >
            {copy.cancelConfirm}
          </Button>
        }
      />
    </>
  );
}
