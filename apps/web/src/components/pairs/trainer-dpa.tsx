"use client";

import { FileText } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { useI18n } from "@/i18n/client";
import { acceptTrainerDpa } from "@/lib/pairs/actions";
import { TRAINER_DPA_PATH } from "@/lib/pairs/clients";
import { hapticSuccess } from "@/lib/telegram/mini-app";

/**
 * The data processing agreement for trainers, in place of the card form or the note composer until the trainer
 * accepts it once (legal product-changes А7). "Принимаю" records it, and the refreshed screen shows the form.
 */
export function TrainerDpa() {
  const { t } = useI18n();
  const copy = t.pairs.dpa;
  const [pending, startTransition] = useTransition();

  function accept() {
    startTransition(async () => {
      const result = await acceptTrainerDpa();
      if (result.ok) {
        hapticSuccess();
        toast.success(copy.accepted);
      } else {
        toast.error(t.pairs.failed);
      }
    });
  }

  return (
    <section aria-labelledby="trainer-dpa" className="flex items-start gap-3 rounded-lg bg-surface-1 p-4">
      <div aria-hidden className="grid size-10 shrink-0 place-items-center rounded-sm bg-surface-2 text-ink-2">
        <FileText size={20} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h2 id="trainer-dpa" className="text-headline">
          {copy.title}
        </h2>
        <p className="text-callout text-ink-2">{copy.text}</p>
        <Link href={TRAINER_DPA_PATH} className="mb-2 self-start text-callout font-semibold text-accent-ink">
          {copy.read}
        </Link>
        <Button onClick={accept} loading={pending} className="self-start">
          {copy.accept}
        </Button>
      </div>
    </section>
  );
}
