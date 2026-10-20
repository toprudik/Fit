"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";
import {
  acceptPersonalData,
  acceptTerms,
  type AcceptState,
  answerHealthData,
  closeUnderageAccount,
  keepUnderageAccount,
} from "@/lib/consent/actions";

const INITIAL: AcceptState = { failed: false };

function Failed({ state }: { state: AcceptState }) {
  const { t } = useI18n();
  if (state.failed !== "save") return null;
  return (
    <p role="alert" className="text-subhead text-danger">
      {t.consent.terms.failed}
    </p>
  );
}

/**
 * "Мне есть 18 лет" and "Принимаю" on the terms screen (legal А1). The box starts unticked; "Мне нет 18 лет" opens
 * the way out: the account is deleted, since DaFit is for adults.
 */
export function TermsForm({ next }: { next: string }) {
  const { t } = useI18n();
  const copy = t.consent.terms;
  const [state, action, pending] = useActionState(acceptTerms, INITIAL);
  const [closeState, closeAction, closing] = useActionState(closeUnderageAccount, INITIAL);
  const [underage, setUnderage] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <form action={action} className="flex flex-col gap-3">
        <input type="hidden" name="next" value={next} />
        <label className="flex items-start gap-3 rounded-lg bg-surface-1 p-4 text-callout">
          <input
            type="checkbox"
            name="adult"
            required
            aria-describedby={state.failed === "age" ? "adult-error" : undefined}
            className="mt-0.5 size-5 shrink-0 cursor-pointer accent-[var(--accent)]"
          />
          <span>{copy.adult}</span>
        </label>
        {state.failed === "age" ? (
          <p id="adult-error" role="alert" className="text-subhead text-danger">
            {copy.adultError}
          </p>
        ) : null}
        <Failed state={state} />
        <Button type="submit" size="lg" block loading={pending}>
          {copy.accept}
        </Button>
      </form>
      {underage ? (
        <form action={closeAction} className="flex flex-col gap-3 rounded-lg bg-surface-1 p-4">
          <input type="hidden" name="next" value={next} />
          <h2 className="text-headline">{copy.underageTitle}</h2>
          <p className="text-subhead text-ink-2">{copy.underageText}</p>
          <Failed state={closeState} />
          <Button type="submit" variant="destructive" block loading={closing}>
            {copy.underageDelete}
          </Button>
        </form>
      ) : (
        <Button type="button" variant="ghost" onClick={() => setUnderage(true)} className="self-center">
          {copy.underage}
        </Button>
      )}
    </div>
  );
}

/**
 * "Даю согласие" on the personal data screen (legal А2). "Не сейчас" stays here and says why: without this consent
 * DaFit cannot keep anything of the user's.
 */
export function PersonalDataForm({ next, first }: { next: string; first: boolean }) {
  const { t } = useI18n();
  const copy = t.consent.personal;
  const [state, action, pending] = useActionState(acceptPersonalData, INITIAL);
  const [later, setLater] = useState(false);

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="next" value={next} />
      {first ? <input type="hidden" name="first" value="1" /> : null}
      {later ? (
        <p role="status" className="rounded-lg bg-surface-1 p-4 text-subhead text-ink-2">
          {copy.laterText}
        </p>
      ) : null}
      <Failed state={state} />
      <Button type="submit" size="lg" block loading={pending}>
        {copy.give}
      </Button>
      <Button type="button" variant="ghost" block onClick={() => setLater(true)}>
        {copy.later}
      </Button>
    </form>
  );
}

/** "Даю согласие" or "Не сейчас" on the health data screen (legal А2); both go on. */
export function HealthDataForm({ next, first }: { next: string; first: boolean }) {
  const { t } = useI18n();
  const copy = t.consent.health;
  const [state, action, pending] = useActionState(answerHealthData, INITIAL);

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="next" value={next} />
      {first ? <input type="hidden" name="first" value="1" /> : null}
      <Failed state={state} />
      <Button type="submit" name="answer" value="give" size="lg" block loading={pending}>
        {copy.give}
      </Button>
      <Button type="submit" name="answer" value="later" variant="ghost" block disabled={pending}>
        {copy.later}
      </Button>
      <p className="text-footnote text-ink-2">{copy.laterHint}</p>
    </form>
  );
}

/** The account is being deleted after "Мне нет 18 лет"; a wrong tap is undone here (legal А1). */
export function UnderageForm({ next }: { next: string }) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState(keepUnderageAccount, INITIAL);

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="next" value={next} />
      <Failed state={state} />
      <Button type="submit" variant="secondary" block loading={pending}>
        {t.consent.underage.keep}
      </Button>
    </form>
  );
}
