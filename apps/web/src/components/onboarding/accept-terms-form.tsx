"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";
import { acceptBetaTerms, type AcceptState } from "@/lib/consent/actions";

const INITIAL: AcceptState = { failed: false };

/** "Принимаю" on the beta terms screen; `next` rides along to the step after it. */
export function AcceptTermsForm({ next }: { next: string }) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState(acceptBetaTerms, INITIAL);

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="next" value={next} />
      {state.failed ? (
        <p role="alert" className="text-subhead text-danger">
          {t.consent.terms.failed}
        </p>
      ) : null}
      <Button type="submit" size="lg" block loading={pending}>
        {t.consent.terms.accept}
      </Button>
    </form>
  );
}
