"use client";

import { HeartPulse } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { useI18n } from "@/i18n/client";
import { acknowledgeHealthNotice } from "@/lib/health-notice/actions";
import { HEALTH_NOTICE_PATH } from "@/lib/health-notice/notice";

/**
 * The health notice as its own block (legal health-disclaimer, product change 8): what DaFit is not, when a doctor
 * comes first, what to do when unwell, a link to the full text and "Понятно". The screen behind it opens after.
 */
export function HealthNotice() {
  const { t } = useI18n();
  const copy = t.healthNotice;
  const [pending, startTransition] = useTransition();

  function acknowledge() {
    startTransition(async () => {
      try {
        await acknowledgeHealthNotice();
      } catch {
        toast.error(copy.failed);
      }
    });
  }

  return (
    <section aria-labelledby="health-notice" className="flex flex-col gap-4 rounded-lg bg-surface-1 p-4">
      <div className="flex items-center gap-3">
        <HeartPulse aria-hidden className="size-6 shrink-0 text-accent" />
        <h2 id="health-notice" className="text-headline">
          {copy.title}
        </h2>
      </div>
      <p className="text-callout">{copy.lead}</p>
      <ul className="flex list-disc flex-col gap-2 pl-5 text-callout text-ink-2">
        {copy.points.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
      <Link href={HEALTH_NOTICE_PATH} className="inline-flex min-h-11 items-center text-callout text-accent-ink">
        {copy.full}
      </Link>
      <Button size="lg" block loading={pending} onClick={acknowledge}>
        {copy.ok}
      </Button>
    </section>
  );
}
