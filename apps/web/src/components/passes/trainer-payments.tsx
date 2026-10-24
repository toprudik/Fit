"use client";

import { Plus, Wallet } from "lucide-react";
import { useCallback, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/sonner";
import { TextField } from "@/components/ui/text-field";
import { useI18n } from "@/i18n/client";
import { interpolate } from "@/i18n/format";
import { currencySymbol, formatMoney, majorText } from "@/lib/money/format";
import { confirmPayment, correctPayment, recordPayment, voidPayment } from "@/lib/passes/actions";
import { amountsText, debtText, unpaidByCurrency } from "@/lib/passes/debt";
import type { PairMoney, PaymentView } from "@/lib/passes/load";
import { localDay, PAYMENT_METHODS } from "@/lib/passes/present";
import { formatNoteTime } from "@/lib/pairs/format";
import { hapticSuccess } from "@/lib/telegram/mini-app";
import { DebtCharges, WaiveForm, type WaiveTarget } from "./charge-forms";
import { ChoiceList } from "./choice-list";
import { PaymentFields, type PaymentValues } from "./payment-fields";
import { SellPassForm } from "./sell-pass-form";

const STATUS_TONE = { reported: "warning", confirmed: "success", voided: "neutral" } as const;

/** One payment: amount (a refund with a minus), what it is for, method, day and its state. */
export function PaymentItem({
  payment,
  passTitle,
  timeZone,
  children,
}: {
  payment: PaymentView;
  passTitle: string | null;
  timeZone: string;
  children?: React.ReactNode;
}) {
  const { t, locale } = useI18n();
  const copy = t.money.payments;
  const amount = formatMoney(locale, payment.amountMinor, payment.currency);
  return (
    <li className="flex flex-col gap-2 rounded-lg bg-surface-1 p-4">
      <div className="flex items-start justify-between gap-3">
        <span className="flex min-w-0 flex-col">
          <span className={payment.status === "voided" ? "text-headline text-ink-2 line-through tabular-nums" : "text-headline tabular-nums"}>
            {payment.direction === "refund" ? `−${amount}` : amount}
          </span>
          <span className="text-footnote text-ink-2">
            {[
              payment.direction === "refund" ? copy.refund : null,
              passTitle ?? copy.onAccount,
              copy.methods[payment.method],
              formatNoteTime(locale, payment.paidAt, timeZone),
            ]
              .filter(Boolean)
              .join(", ")}
          </span>
        </span>
        <Badge tone={STATUS_TONE[payment.status]}>{copy.status[payment.status]}</Badge>
      </div>
      {payment.reported && payment.status === "reported" ? <p className="text-subhead text-ink-2">{copy.reportedByClient}</p> : null}
      {payment.note ? <p className="text-subhead break-words">{payment.note}</p> : null}
      {payment.status === "voided" && payment.voidReason ? (
        <p className="text-footnote text-ink-2 break-words">{interpolate(copy.voidReason, { reason: payment.voidReason })}</p>
      ) : null}
      {children}
    </li>
  );
}

type Target = "new" | "account" | string;

/** "Отметить оплату" (screens.md 4.5): for a pass of the pair, a new pass from a package, or without a pass. */
function RecordForm({ money, symbol, onDone }: { money: PairMoney; symbol: string; onDone: () => void }) {
  const { t, locale } = useI18n();
  const copy = t.money.payments.form;
  const open = money.passes.filter((pass) => pass.status !== "cancelled");
  const firstUnpaid = open.find((pass) => pass.unpaidMinor > 0);
  const live = money.status !== "ended";
  const [target, setTarget] = useState<Target>(firstUnpaid?.id ?? (live ? "new" : "account"));
  const [direction, setDirection] = useState<"in" | "refund">("in");
  const [values, setValues] = useState<PaymentValues>({
    amount: firstUnpaid ? majorText(firstUnpaid.unpaidMinor) : "",
    method: "sbp",
    paidOn: money.today,
  });
  const [errors, setErrors] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const pass = open.find((candidate) => candidate.id === target);

  function pick(next: Target) {
    setTarget(next);
    const chosen = open.find((candidate) => candidate.id === next);
    if (chosen && chosen.unpaidMinor > 0) setValues((current) => ({ ...current, amount: majorText(chosen.unpaidMinor) }));
  }

  return (
    <div className="flex flex-col gap-4">
      <ChoiceList
        label={copy.target}
        value={target}
        onChange={pick}
        choices={[
          ...open.map((candidate) => ({
            value: candidate.id,
            title: candidate.title,
            subtitle:
              candidate.unpaidMinor > 0
                ? interpolate(copy.unpaid, { amount: formatMoney(locale, candidate.unpaidMinor, candidate.currency) })
                : t.money.passes.payment.paid,
          })),
          ...(live ? [{ value: "new", title: copy.newPass }] : []),
          { value: "account", title: copy.onAccount },
        ]}
      />
      {target === "new" ? (
        <SellPassForm
          coachingId={money.coachingId}
          packages={money.packages}
          symbol={symbol}
          today={money.today}
          debtSessions={money.debt.sessions}
          withPayment
          onDone={onDone}
        />
      ) : (
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            startTransition(async () => {
              const result = await recordPayment({
                coachingId: money.coachingId,
                passId: target === "account" ? null : target,
                direction,
                payment: values,
                note: "",
              });
              setErrors(result.status === "invalid" ? result.fields : []);
              if (result.status === "done") {
                hapticSuccess();
                toast.success(copy.done);
                onDone();
              } else if (result.status === "stale") toast.error(t.money.passes.stale);
              else if (result.status !== "invalid") toast.error(t.money.passes.failed);
            });
          }}
        >
          <div className="flex flex-col gap-1.5">
            <span aria-hidden className="px-1 text-footnote text-ink-2">
              {copy.direction}
            </span>
            <SegmentedControl
              label={copy.direction}
              value={direction}
              onValueChange={setDirection}
              options={[
                { value: "in", label: copy.in },
                { value: "refund", label: copy.refund },
              ]}
            />
          </div>
          <PaymentFields
            values={values}
            onChange={setValues}
            symbol={pass ? currencySymbol(locale, pass.currency) : symbol}
            today={money.today}
            errors={{ amount: errors.includes("payment.amount"), paidOn: errors.includes("payment.paidOn") }}
          />
          <Button type="submit" size="lg" block loading={pending}>
            {copy.submit}
          </Button>
        </form>
      )}
    </div>
  );
}

function VoidForm({ payment, onDone }: { payment: PaymentView; onDone: () => void }) {
  const { t } = useI18n();
  const copy = t.money.payments.voidForm;
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await voidPayment({ paymentId: payment.id, reason });
          setErrors(result.status === "invalid" ? result.fields : []);
          if (result.status === "done") {
            toast.success(t.money.payments.voided);
            onDone();
          } else if (result.status === "stale") toast.error(t.money.passes.stale);
          else if (result.status !== "invalid") toast.error(t.money.passes.failed);
        });
      }}
    >
      <p className="text-subhead text-ink-2">{copy.text}</p>
      <TextField
        label={copy.reason}
        maxLength={500}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        error={errors.includes("reason") ? copy.reasonError : undefined}
        autoComplete="off"
      />
      <Button type="submit" variant="destructive" size="lg" block loading={pending}>
        {copy.submit}
      </Button>
    </form>
  );
}

/** "Исправить": the payment's amount, method and day to change, and what was wrong. */
function CorrectForm({ payment, money, onDone }: { payment: PaymentView; money: PairMoney; onDone: () => void }) {
  const { t, locale } = useI18n();
  const copy = t.money.payments.correctForm;
  const method = PAYMENT_METHODS.find((known) => known === payment.method) ?? "other";
  const [values, setValues] = useState<PaymentValues>({
    amount: majorText(payment.amountMinor),
    method,
    paidOn: localDay(payment.paidAt, money.timeZone),
  });
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await correctPayment({ paymentId: payment.id, payment: values, reason });
          setErrors(result.status === "invalid" ? result.fields : []);
          if (result.status === "done") {
            hapticSuccess();
            toast.success(t.money.payments.corrected);
            onDone();
          } else if (result.status === "stale") toast.error(t.money.passes.stale);
          else if (result.status !== "invalid") toast.error(t.money.passes.failed);
        });
      }}
    >
      <p className="text-subhead text-ink-2">{copy.text}</p>
      <PaymentFields
        values={values}
        onChange={setValues}
        symbol={currencySymbol(locale, payment.currency)}
        today={money.today}
        errors={{ amount: errors.includes("payment.amount"), paidOn: errors.includes("payment.paidOn") }}
      />
      <TextField
        label={copy.reason}
        maxLength={500}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        error={errors.includes("reason") ? copy.reasonError : undefined}
        autoComplete="off"
      />
      <Button type="submit" size="lg" block loading={pending}>
        {copy.submit}
      </Button>
    </form>
  );
}

/** Confirm a client's report or correct a confirmed payment, and void any payment that is not voided yet. */
export function PaymentControls({ payment, onVoid, onCorrect }: { payment: PaymentView; onVoid: () => void; onCorrect?: () => void }) {
  const { t } = useI18n();
  const copy = t.money.payments;
  const [pending, startTransition] = useTransition();
  if (payment.status === "voided") return null;
  return (
    <div className="flex flex-wrap gap-2">
      {payment.status === "reported" ? (
        <Button
          size="sm"
          loading={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await confirmPayment(payment.id, payment.updatedAt);
              if (result.status === "done") {
                hapticSuccess();
                toast.success(copy.confirmed);
              } else if (result.status === "stale") toast.error(copy.changed);
              else toast.error(t.money.passes.failed);
            })
          }
        >
          {copy.confirm}
        </Button>
      ) : null}
      {payment.status === "confirmed" && onCorrect ? (
        <Button size="sm" variant="secondary" onClick={onCorrect}>
          {copy.correct}
        </Button>
      ) : null}
      <Button size="sm" variant="ghost" onClick={onVoid}>
        {copy.void}
      </Button>
    </div>
  );
}

/**
 * "Оплаты" of a client card (screens.md): the debt, "Отметить оплату" (opened at once by `?action=new`, the
 * t_pay_ link) and every payment with "Подтвердить" for a client's report and "Аннулировать".
 */
export function TrainerPayments({ money, symbol, startOpen }: { money: PairMoney; symbol: string; startOpen: boolean }) {
  const { t, locale } = useI18n();
  const copy = t.money.payments;
  const [recording, setRecording] = useState(startOpen);
  const [voiding, setVoiding] = useState<PaymentView | null>(null);
  const [correcting, setCorrecting] = useState<PaymentView | null>(null);
  const [waiving, setWaiving] = useState<WaiveTarget | null>(null);
  const close = useCallback(() => setRecording(false), []);
  const titles = new Map(money.passes.map((pass) => [pass.id, pass.title]));
  const unpaid = unpaidByCurrency(money.passes);

  return (
    <div className="flex flex-col gap-4">
      {/* No "Долга нет" over an unpaid sum (QA 24.10). */}
      {money.debt.sessions > 0 || !Object.keys(unpaid).length ? (
        <div className="flex items-center justify-between gap-3 rounded-lg bg-surface-1 px-4 py-3">
          <span className="text-body">{copy.debt}</span>
          <span className="text-body text-ink-2 tabular-nums">{debtText(t, locale, money.debt)}</span>
        </div>
      ) : null}
      {Object.keys(unpaid).length ? (
        <div className="flex items-center justify-between gap-3 rounded-lg bg-surface-1 px-4 py-3">
          <span className="text-body">{t.money.overview.unpaid}</span>
          <span className="text-body text-ink-2 tabular-nums">{amountsText(locale, unpaid)}</span>
        </div>
      ) : null}
      {/* "Долг" leads here from "Сегодня" and the overview, so the sessions owed can be forgiven here too (QA U5). */}
      {money.debtCharges.length ? (
        <DebtCharges charges={money.debtCharges} timeZone={money.timeZone} onWaive={money.status !== "ended" ? setWaiving : null} />
      ) : null}
      <Button size="lg" block icon={Plus} onClick={() => setRecording(true)}>
        {copy.record}
      </Button>
      {money.payments.length === 0 ? (
        <EmptyState icon={Wallet} title={copy.empty} description={copy.emptyText} />
      ) : (
        <ul className="flex flex-col gap-2">
          {money.payments.map((payment) => (
            <PaymentItem key={payment.id} payment={payment} passTitle={payment.passId ? (titles.get(payment.passId) ?? null) : null} timeZone={money.timeZone}>
              <PaymentControls payment={payment} onVoid={() => setVoiding(payment)} onCorrect={() => setCorrecting(payment)} />
            </PaymentItem>
          ))}
        </ul>
      )}

      <Sheet open={recording} onOpenChange={setRecording} title={copy.form.title}>
        {recording ? <RecordForm money={money} symbol={symbol} onDone={close} /> : null}
      </Sheet>
      <Sheet open={voiding !== null} onOpenChange={(next) => (next ? null : setVoiding(null))} title={copy.voidForm.title}>
        {voiding ? <VoidForm key={voiding.id} payment={voiding} onDone={() => setVoiding(null)} /> : null}
      </Sheet>
      <Sheet open={waiving !== null} onOpenChange={(next) => (next ? null : setWaiving(null))} title={t.money.passes.waiveForm.title}>
        {waiving ? <WaiveForm key={waiving.chargeId} target={waiving} onDone={() => setWaiving(null)} /> : null}
      </Sheet>
      <Sheet open={correcting !== null} onOpenChange={(next) => (next ? null : setCorrecting(null))} title={copy.correctForm.title}>
        {correcting ? <CorrectForm key={correcting.id} payment={correcting} money={money} onDone={() => setCorrecting(null)} /> : null}
      </Sheet>
    </div>
  );
}
