"use client";

import { SegmentedControl } from "@/components/ui/segmented-control";
import { TextField } from "@/components/ui/text-field";
import { useI18n } from "@/i18n/client";
import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/passes/present";

export type PaymentValues = { amount: string; method: (typeof PAYMENT_METHODS)[number]; paidOn: string };

/** Amount in the pass currency, method (СБП, наличные, перевод, другое) and the day it was paid. */
export function PaymentFields({
  values,
  onChange,
  symbol,
  today,
  errors,
  hint,
}: {
  values: PaymentValues;
  onChange: (values: PaymentValues) => void;
  symbol: string;
  today: string;
  errors: { amount?: boolean; paidOn?: boolean };
  hint?: string;
}) {
  const { t } = useI18n();
  const copy = t.money.payments;
  return (
    <>
      <TextField
        label={copy.form.amount}
        inputMode="decimal"
        suffix={symbol}
        value={values.amount}
        onChange={(event) => onChange({ ...values, amount: event.target.value })}
        hint={hint}
        error={errors.amount ? copy.form.amountError : undefined}
        autoComplete="off"
      />
      <div className="flex flex-col gap-1.5">
        <span aria-hidden className="px-1 text-footnote text-ink-2">
          {copy.form.method}
        </span>
        <SegmentedControl
          label={copy.form.method}
          value={values.method}
          onValueChange={(method: PaymentMethod) => onChange({ ...values, method: method as PaymentValues["method"] })}
          options={PAYMENT_METHODS.map((method) => ({ value: method, label: copy.methods[method] }))}
        />
      </div>
      <TextField
        label={copy.form.paidOn}
        type="date"
        max={today}
        value={values.paidOn}
        onChange={(event) => onChange({ ...values, paidOn: event.target.value })}
        error={errors.paidOn ? copy.form.dayError : undefined}
      />
    </>
  );
}
