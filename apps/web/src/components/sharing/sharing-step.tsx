"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ChipRadio } from "@/components/ui/chip";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";
import { decideShares } from "@/lib/intake/actions";
import { clientPairPath } from "@/lib/intake/paths";
import { SHARE_CATEGORIES, type ShareCategory, type Shares } from "@/lib/sharing/categories";

type Answers = Partial<Record<ShareCategory, boolean>>;

/**
 * The sharing step after a new pair starts (decisions Q38, legal product-changes А4): "Показать" or "Не
 * показывать" for every category, with nothing chosen in advance. "Решить позже" leaves everything closed.
 */
export function SharingStep({ coachingId }: { coachingId: string }) {
  const { t } = useI18n();
  const copy = t.intake.consent;
  const [answers, setAnswers] = useState<Answers>({});
  const [missing, setMissing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit() {
    const complete = SHARE_CATEGORIES.every((category) => answers[category] !== undefined);
    setMissing(!complete);
    setFailed(false);
    if (!complete) return;
    startTransition(async () => {
      // On success the action moves on to the intake or the pair; it returns only on failure.
      const result = await decideShares(coachingId, answers as Shares);
      if (result?.failed) setFailed(true);
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <ul className="flex flex-col gap-4">
        {SHARE_CATEGORIES.map((category) => {
          const labels = t.sharing.categories[category];
          const unanswered = missing && answers[category] === undefined;
          return (
            <li key={category}>
              <fieldset className="flex flex-col gap-2" aria-describedby={`share-${category}-hint`}>
                <legend className="text-headline">{labels.label}</legend>
                <p id={`share-${category}-hint`} className="text-subhead text-ink-2">
                  {labels.hint}
                </p>
                <div className="flex flex-wrap gap-2">
                  <ChipRadio
                    name={`share-${category}`}
                    checked={answers[category] === true}
                    onChange={() => setAnswers((current) => ({ ...current, [category]: true }))}
                  >
                    {copy.show}
                  </ChipRadio>
                  <ChipRadio
                    name={`share-${category}`}
                    checked={answers[category] === false}
                    onChange={() => setAnswers((current) => ({ ...current, [category]: false }))}
                  >
                    {copy.hide}
                  </ChipRadio>
                </div>
                {unanswered ? <p className="text-footnote text-danger">{copy.missing}</p> : null}
              </fieldset>
            </li>
          );
        })}
      </ul>
      {failed ? (
        <p role="alert" className="text-subhead text-danger">
          {copy.failed}
        </p>
      ) : null}
      <Button type="button" size="lg" block onClick={submit} loading={pending}>
        {copy.save}
      </Button>
      <Button asChild variant="ghost" size="lg" block>
        <Link href={clientPairPath(coachingId)}>{copy.later}</Link>
      </Button>
      <p className="text-footnote text-ink-2">{copy.laterHint}</p>
    </div>
  );
}
