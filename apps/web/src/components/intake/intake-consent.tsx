"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";
import { decideIntakeShare } from "@/lib/intake/actions";
import { clientPairPath } from "@/lib/intake/paths";

/**
 * The consent step (decisions Q38, INTK-6): two equal buttons with nothing chosen in advance, and "Решить
 * позже", which leaves the intake hidden until the client answers.
 */
export function IntakeConsent({ coachingId }: { coachingId: string }) {
  const { t } = useI18n();
  const copy = t.intake.consent;
  const [pending, startTransition] = useTransition();
  const [choice, setChoice] = useState<boolean | null>(null);
  const [failed, setFailed] = useState(false);

  function decide(show: boolean) {
    setChoice(show);
    setFailed(false);
    startTransition(async () => {
      // On success the action moves on to the intake or the pair; it returns only on failure.
      const result = await decideIntakeShare(coachingId, show);
      if (result?.failed) setFailed(true);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {failed ? (
        <p role="alert" className="text-subhead text-danger">
          {copy.failed}
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        <Button type="button" variant="secondary" size="lg" block onClick={() => decide(true)} loading={pending && choice === true} disabled={pending}>
          {copy.show}
        </Button>
        <Button type="button" variant="secondary" size="lg" block onClick={() => decide(false)} loading={pending && choice === false} disabled={pending}>
          {copy.hide}
        </Button>
      </div>
      <Button asChild variant="ghost" size="lg" block>
        <Link href={clientPairPath(coachingId)}>{copy.later}</Link>
      </Button>
      <p className="text-footnote text-ink-2">{copy.laterHint}</p>
    </div>
  );
}
