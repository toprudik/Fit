"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { toast } from "@/components/ui/sonner";
import { Switch } from "@/components/ui/switch";
import { TextField } from "@/components/ui/text-field";
import { useI18n } from "@/i18n/client";
import { majorText } from "@/lib/money/format";
import { savePackage, type PackageFormState } from "@/lib/packages/actions";
import { APPLIES_TO, type PackageAppliesTo } from "@/lib/packages/grid";
import { ValidityField } from "./validity-field";

const IDLE: PackageFormState = { status: "idle" };

export type EditablePackage = {
  id: string;
  title: string;
  sessionsCount: number;
  priceMinor: number;
  validityDays: number | null;
  appliesTo: PackageAppliesTo;
  isPublic: boolean;
};

const isAppliesTo = (value: string): value is PackageAppliesTo => (APPLIES_TO as readonly string[]).includes(value);

/**
 * A package: name (empty = by the number of sessions), sessions, price for the whole pack in the trainer's
 * currency, validity, what it covers and whether the showcase shows it. New packages and edits alike;
 * `onSaved` closes the sheet around it.
 */
export function PackageForm({ initial, symbol, onSaved }: { initial: EditablePackage | null; symbol: string; onSaved: () => void }) {
  const { t, locale } = useI18n();
  const copy = t.money.packages;
  const [state, action, pending] = useActionState(savePackage, IDLE);
  const values = state.status === "invalid" || state.status === "failed" || state.status === "taken" ? state.values : null;
  const invalid = (field: string) => state.status === "invalid" && state.fields.includes(field);
  const sent = (name: string, fallback: string) => values?.[name] ?? fallback;
  const [appliesTo, setAppliesTo] = useState<PackageAppliesTo>(() => {
    const value = sent("appliesTo", initial?.appliesTo ?? "any");
    return isAppliesTo(value) ? value : "any";
  });
  const [isPublic, setIsPublic] = useState(values ? values.isPublic === "on" : (initial?.isPublic ?? true));

  useEffect(() => {
    if (state.status !== "saved") return;
    toast.success(copy.form.saved);
    onSaved();
  }, [state, copy.form.saved, onSaved]);

  return (
    <form key={JSON.stringify(state)} action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="id" value={initial?.id ?? ""} />
      <input type="hidden" name="locale" value={locale} />
      <TextField
        name="title"
        label={copy.form.name}
        hint={copy.form.nameHint}
        defaultValue={sent("title", initial?.title ?? "")}
        maxLength={120}
        error={invalid("title") ? copy.form.nameError : undefined}
        autoComplete="off"
      />
      <TextField
        name="sessions"
        label={copy.form.sessions}
        inputMode="numeric"
        defaultValue={sent("sessions", initial ? String(initial.sessionsCount) : "")}
        error={invalid("sessions") ? copy.form.sessionsError : undefined}
        autoComplete="off"
      />
      <TextField
        name="price"
        label={copy.form.price}
        inputMode="decimal"
        suffix={symbol}
        defaultValue={sent("price", initial ? majorText(initial.priceMinor) : "")}
        hint={initial ? copy.form.priceHint : undefined}
        error={invalid("price") ? copy.form.priceError : undefined}
        autoComplete="off"
      />
      <ValidityField name="validity" initial={sent("validity", initial?.validityDays ? String(initial.validityDays) : "")} invalid={invalid("validity")} />
      <div className="flex flex-col gap-1.5">
        <span aria-hidden className="px-1 text-footnote text-ink-2">
          {copy.appliesTo.label}
        </span>
        <input type="hidden" name="appliesTo" value={appliesTo} />
        <SegmentedControl
          label={copy.appliesTo.label}
          value={appliesTo}
          onValueChange={setAppliesTo}
          options={APPLIES_TO.map((value) => ({ value, label: copy.appliesTo[value] }))}
        />
      </div>
      <input type="hidden" name="isPublic" value={isPublic ? "on" : ""} />
      <Switch checked={isPublic} onCheckedChange={setIsPublic} label={copy.form.isPublic} hint={copy.form.isPublicHint} showLabel />
      {state.status === "failed" || state.status === "taken" ? (
        <p role="alert" className="text-subhead text-danger">
          {state.status === "taken" ? copy.form.dropInTaken : copy.form.failed}
        </p>
      ) : null}
      <Button type="submit" size="lg" block loading={pending}>
        {copy.form.submit}
      </Button>
    </form>
  );
}
