"use client";

import { useActionState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { useI18n } from "@/i18n/client";
import { createGridFromTemplate, type PackageFormState } from "@/lib/packages/actions";
import { TemplateFields } from "./template-fields";

const IDLE: PackageFormState = { status: "idle" };

/** "Сетка из шаблона" on /trainer/money/packages, shown while the trainer has no live packages. */
export function TemplateForm({ currency, symbol }: { currency: string; symbol: string }) {
  const { t } = useI18n();
  const copy = t.money.packages;
  const [state, action, pending] = useActionState(createGridFromTemplate, IDLE);
  const values = state.status === "invalid" || state.status === "failed" || state.status === "taken" ? state.values : null;
  const fields = state.status === "invalid" ? state.fields : [];

  useEffect(() => {
    if (state.status === "saved") toast.success(copy.template.created);
  }, [state, copy.template.created]);

  return (
    <section aria-labelledby="price-template" className="flex flex-col gap-3">
      <h2 id="price-template" className="px-1 text-headline">
        {copy.template.title}
      </h2>
      <form key={JSON.stringify(state)} action={action} className="flex flex-col gap-4 rounded-lg bg-surface-1 p-4" noValidate>
        <TemplateFields currency={currency} symbol={symbol} values={values} error={(field) => fields.includes(field)} />
        {state.status === "failed" || state.status === "taken" ? (
          <p role="alert" className="text-subhead text-danger">
            {state.status === "taken" ? copy.form.dropInTaken : copy.template.failed}
          </p>
        ) : null}
        <Button type="submit" size="lg" block loading={pending}>
          {copy.template.submit}
        </Button>
      </form>
    </section>
  );
}
