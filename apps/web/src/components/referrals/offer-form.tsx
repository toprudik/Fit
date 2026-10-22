"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/sonner";
import { DateField } from "@/components/ui/date-field";
import { TextField } from "@/components/ui/text-field";
import { useI18n } from "@/i18n/client";
import { saveReferralOffer, stopReferralOffer, type OfferFormState } from "@/lib/referrals/actions";

const IDLE: OfferFormState = { status: "idle" };

type Condition = "none" | "amount" | "package";

const SELECT_CLASS =
  "h-13 w-full rounded-sm border border-field-line bg-field px-4 text-body text-ink outline-none focus:border-focus-ring focus:shadow-[0_0_0_1px_var(--focus-ring)]";

/**
 * "Новая акция" on /trainer/referrals (PRD wave-3 §3.1-1): sessions for the client per friend (1–5) and for the
 * friend (0–5), when to give them (any payment, from a sum in the trainer's currency, or one package) and the last
 * day. Saving replaces the live offer; React resets the form after its action, so a rejected one gets its values back.
 */
export function OfferForm({
  currency,
  packages,
  editing,
}: {
  /** "₽", shown after the sum. */
  currency: string;
  packages: { id: string; title: string }[];
  /** A live offer is being replaced. */
  editing: boolean;
}) {
  const { t } = useI18n();
  const copy = t.referrals.form;
  const [state, action, pending] = useActionState(saveReferralOffer, IDLE);
  const values = state.status === "invalid" || state.status === "failed" ? state.values : null;
  const invalid = (field: string) => state.status === "invalid" && state.fields.includes(field as never);
  const [condition, setCondition] = useState<Condition>((values?.condition as Condition) || "none");

  useEffect(() => {
    if (state.status === "saved") toast.success(copy.saved);
  }, [state, copy.saved]);

  const options: { value: Condition; label: string }[] = [
    { value: "none", label: copy.conditionNone },
    { value: "amount", label: copy.conditionAmount },
    ...(packages.length ? [{ value: "package" as const, label: copy.conditionPackage }] : []),
  ];

  return (
    <section aria-labelledby="referral-offer-form" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1 px-1">
        <h2 id="referral-offer-form" className="text-headline">
          {editing ? copy.editHeader : copy.header}
        </h2>
        {editing ? <p className="text-footnote text-ink-2">{copy.editHint}</p> : null}
      </div>
      <form key={JSON.stringify(state)} action={action} className="flex flex-col gap-4 rounded-lg bg-surface-1 p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label={copy.referrer}
            name="referrer"
            inputMode="numeric"
            defaultValue={values?.referrer ?? "1"}
            error={invalid("referrer") ? copy.sessionsError : undefined}
          />
          <TextField
            label={copy.referee}
            name="referee"
            inputMode="numeric"
            defaultValue={values?.referee ?? "0"}
            error={invalid("referee") ? copy.refereeError : undefined}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="px-1 text-footnote text-ink-2">{copy.condition}</span>
          <input type="hidden" name="condition" value={condition} />
          <SegmentedControl label={copy.condition} value={condition} onValueChange={setCondition} options={options} />
        </div>
        {condition === "amount" ? (
          <TextField
            label={copy.amount}
            name="amount"
            inputMode="decimal"
            defaultValue={values?.amount ?? ""}
            suffix={currency}
            error={invalid("amount") ? copy.amountError : undefined}
          />
        ) : null}
        {condition === "package" ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="referral-package" className="px-1 text-footnote text-ink-2">
              {copy.package}
            </label>
            <select id="referral-package" name="package" defaultValue={values?.package ?? packages[0]?.id ?? ""} className={SELECT_CLASS}>
              {packages.map((pack) => (
                <option key={pack.id} value={pack.id}>
                  {pack.title}
                </option>
              ))}
            </select>
            {invalid("package") ? <p className="px-1 text-footnote text-danger">{copy.packageError}</p> : null}
          </div>
        ) : null}
        <DateField
          label={copy.until}
          name="until"
          defaultValue={values?.until ?? ""}
          hint={copy.untilHint}
          error={invalid("until") ? copy.untilError : undefined}
        />
        {state.status === "failed" ? (
          <p role="alert" className="text-subhead text-danger">
            {state.reason === "plan" ? copy.plan : copy.failed}
          </p>
        ) : null}
        <Button type="submit" size="lg" block loading={pending}>
          {copy.submit}
        </Button>
      </form>
    </section>
  );
}

/** "Остановить акцию" behind a confirmation. */
export function StopOfferButton() {
  const { t } = useI18n();
  const copy = t.referrals;
  const [open, setOpen] = useState(false);
  const [stopping, startStop] = useTransition();

  function stop() {
    startStop(async () => {
      const { failed } = await stopReferralOffer();
      if (failed) {
        toast.error(copy.stopFailed);
        return;
      }
      setOpen(false);
      toast.success(copy.stopped);
    });
  }

  return (
    <>
      <Button variant="ghost" className="self-start" onClick={() => setOpen(true)}>
        {copy.stop}
      </Button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={copy.stop}
        description={copy.stopText}
        actions={
          <>
            <Button variant="destructive" size="lg" block loading={stopping} onClick={stop}>
              {copy.stopConfirm}
            </Button>
            <Button variant="ghost" size="lg" block onClick={() => setOpen(false)}>
              {copy.keep}
            </Button>
          </>
        }
      />
    </>
  );
}
