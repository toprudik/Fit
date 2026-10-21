"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ValidityField } from "@/components/packages/validity-field";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { toast } from "@/components/ui/sonner";
import { Switch } from "@/components/ui/switch";
import { TextField } from "@/components/ui/text-field";
import { useI18n } from "@/i18n/client";
import { plural } from "@/i18n/format";
import { formatMoney, majorText } from "@/lib/money/format";
import { APPLIES_TO, type PackageAppliesTo } from "@/lib/packages/grid";
import { sellPass } from "@/lib/passes/actions";
import type { SellablePackage } from "@/lib/passes/load";
import { hapticSuccess } from "@/lib/telegram/mini-app";
import { ChoiceList } from "./choice-list";
import { PaymentFields, type PaymentValues } from "./payment-fields";

type Source = "package" | "custom";

/**
 * "Оформить абонемент" (screens.md "Абонементы", 4.5): terms from a live package or custom ones, the start day,
 * and optionally the payment received with it. The preview says the debt is paid off first (PRD 2.8-9).
 */
export function SellPassForm({
  coachingId,
  packages,
  symbol,
  today,
  debtSessions,
  withPayment = false,
  onDone,
}: {
  coachingId: string;
  packages: SellablePackage[];
  symbol: string;
  today: string;
  debtSessions: number;
  withPayment?: boolean;
  onDone: () => void;
}) {
  const { t, locale } = useI18n();
  const copy = t.money.passes.sellForm;
  const pack = t.money.packages;
  const [source, setSource] = useState<Source>(packages.length ? "package" : "custom");
  const [packageId, setPackageId] = useState<string | null>(packages[0]?.id ?? null);
  const [custom, setCustom] = useState({ title: "", sessions: "", price: "", validity: "", appliesTo: "any" as PackageAppliesTo });
  const [startsOn, setStartsOn] = useState(today);
  const [paid, setPaid] = useState(withPayment);
  const chosen = packages.find((item) => item.id === packageId) ?? null;
  const [payment, setPayment] = useState<PaymentValues>({ amount: chosen ? majorText(chosen.priceMinor) : "", method: "sbp", paidOn: today });
  const [errors, setErrors] = useState<string[]>([]);
  const [requestId] = useState(() => crypto.randomUUID());
  const [pending, startTransition] = useTransition();
  const invalid = (field: string) => errors.some((error) => error === field || error.startsWith(`${field}.`));

  const sessions = source === "package" ? (chosen?.sessionsCount ?? 0) : Number(custom.sessions) || 0;

  function pickPackage(id: string) {
    setPackageId(id);
    const next = packages.find((item) => item.id === id);
    if (next) setPayment((current) => ({ ...current, amount: majorText(next.priceMinor) }));
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await sellPass({
        coachingId,
        startsOn,
        note: "",
        source:
          source === "package"
            ? { kind: "package", packageId: packageId ?? "" }
            : { kind: "custom", ...custom, title: custom.title || (sessions === 1 ? pack.titles.dropIn : plural(locale, sessions, pack.titles.pack)) },
        payment: paid ? payment : null,
        requestId,
      });
      if (result.status === "invalid") {
        setErrors(result.fields);
        return;
      }
      setErrors([]);
      if (result.status === "sold") {
        hapticSuccess();
        toast.success(result.settled > 0 ? interpolateDebt(copy.soldSettled, plural(locale, result.settled, t.pairs.debtSessions)) : copy.sold);
        onDone();
      } else if (result.status === "refused") toast.error(copy.ended);
      else if (result.status === "stale") toast.error(copy.alreadySold);
      else toast.error(t.money.passes.failed);
    });
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span aria-hidden className="px-1 text-footnote text-ink-2">
          {copy.source}
        </span>
        <SegmentedControl
          label={copy.source}
          value={source}
          onValueChange={setSource}
          options={[
            { value: "package", label: copy.fromPackage },
            { value: "custom", label: copy.custom },
          ]}
        />
      </div>

      {source === "package" ? (
        packages.length ? (
          <ChoiceList
            label={copy.package}
            value={packageId}
            onChange={pickPackage}
            choices={packages.map((item) => ({
              value: item.id,
              title: item.title,
              subtitle: [
                formatMoney(locale, item.priceMinor, item.currency),
                item.validityDays ? plural(locale, item.validityDays, pack.validity.days) : pack.validity.none,
                item.appliesTo === "any" ? null : pack.appliesTo[item.appliesTo],
              ]
                .filter(Boolean)
                .join(", "),
            }))}
          />
        ) : (
          <p className="rounded-md bg-surface-2 px-4 py-3 text-subhead text-ink-2">
            {copy.noPackages}{" "}
            <Link href="/trainer/money/packages" className="font-semibold text-accent-ink">
              {copy.packagesLink}
            </Link>
          </p>
        )
      ) : (
        <>
          <TextField
            label={copy.name}
            hint={pack.form.nameHint}
            value={custom.title}
            onChange={(event) => setCustom({ ...custom, title: event.target.value })}
            maxLength={120}
            error={invalid("source.title") ? copy.nameError : undefined}
            autoComplete="off"
          />
          <TextField
            label={copy.sessions}
            inputMode="numeric"
            value={custom.sessions}
            onChange={(event) => setCustom({ ...custom, sessions: event.target.value })}
            error={invalid("source.sessions") ? copy.sessionsError : undefined}
            autoComplete="off"
          />
          <TextField
            label={copy.price}
            inputMode="decimal"
            suffix={symbol}
            value={custom.price}
            onChange={(event) => {
              setCustom({ ...custom, price: event.target.value });
              setPayment((current) => ({ ...current, amount: event.target.value }));
            }}
            error={invalid("source.price") ? copy.priceError : undefined}
            autoComplete="off"
          />
          <ValidityField
            name="validity"
            initial={custom.validity}
            invalid={invalid("source.validity")}
            onChange={(validity) => setCustom((current) => ({ ...current, validity }))}
          />
          <div className="flex flex-col gap-1.5">
            <span aria-hidden className="px-1 text-footnote text-ink-2">
              {pack.appliesTo.label}
            </span>
            <SegmentedControl
              label={pack.appliesTo.label}
              value={custom.appliesTo}
              onValueChange={(appliesTo: PackageAppliesTo) => setCustom({ ...custom, appliesTo })}
              options={APPLIES_TO.map((value) => ({ value, label: pack.appliesTo[value] }))}
            />
          </div>
        </>
      )}

      <TextField
        label={copy.startsOn}
        type="date"
        value={startsOn}
        onChange={(event) => setStartsOn(event.target.value)}
        error={invalid("startsOn") ? t.money.passes.expiryForm.dayError : undefined}
      />

      <Switch checked={paid} onCheckedChange={setPaid} label={copy.paid} hint={copy.paidHint} showLabel />
      {paid ? (
        <PaymentFields
          values={payment}
          onChange={setPayment}
          symbol={symbol}
          today={today}
          errors={{ amount: invalid("payment.amount"), paidOn: invalid("payment.paidOn") }}
        />
      ) : null}

      {sessions > 0 ? (
        <p className="text-subhead text-ink-2">
          {interpolateSessions(copy.preview, plural(locale, sessions, t.pairs.debtSessions))}
          {debtSessions > 0 ? ` ${interpolateDebt(copy.previewDebt, plural(locale, debtSessions, t.pairs.debtSessions))}` : null}
        </p>
      ) : null}
      <Button type="submit" size="lg" block loading={pending} disabled={source === "package" && !chosen}>
        {copy.submit}
      </Button>
    </form>
  );
}

function interpolateDebt(template: string, debt: string): string {
  return template.replace("{debt}", debt);
}

function interpolateSessions(template: string, sessions: string): string {
  return template.replace("{sessions}", sessions);
}
