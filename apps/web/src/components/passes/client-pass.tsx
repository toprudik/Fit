"use client";

import { ExternalLink, Wallet } from "lucide-react";
import { useState, useTransition } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/sonner";
import { useI18n } from "@/i18n/client";
import { currencySymbol, majorText } from "@/lib/money/format";
import { reportPayment, withdrawReport } from "@/lib/passes/actions";
import type { ClientPass } from "@/lib/passes/load";
import { hapticSuccess, openExternalLink } from "@/lib/telegram/mini-app";
import { cn } from "@/lib/utils";
import { PassHistory, PassSummary } from "./pass-card";
import { PaymentFields, type PaymentValues } from "./payment-fields";
import { PaymentItem } from "./trainer-payments";

/** The rest of a pass as a ring: what is left out of the sessions it gave. */
function RemainingRing({ remaining, total, label }: { remaining: number; total: number; label: string }) {
  const radius = 52;
  const length = 2 * Math.PI * radius;
  const share = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;
  return (
    <figure className="flex flex-col items-center gap-2">
      <div className="relative size-36">
        <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden>
          <circle cx="60" cy="60" r={radius} fill="none" strokeWidth="10" className="stroke-surface-3" />
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={length}
            strokeDashoffset={length * (1 - share)}
            className="stroke-accent"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-num-xl tabular-nums">{remaining}</span>
      </div>
      <figcaption className="text-footnote text-ink-2">{label}</figcaption>
    </figure>
  );
}

function ReportForm({ data, onDone }: { data: ClientPass; onDone: () => void }) {
  const { t, locale } = useI18n();
  const copy = t.money.client;
  const [values, setValues] = useState<PaymentValues>({
    amount: data.pass.unpaidMinor > 0 ? majorText(data.pass.unpaidMinor) : "",
    method: "sbp",
    paidOn: data.today,
  });
  const [errors, setErrors] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await reportPayment({ passId: data.pass.id, payment: values, note: "" });
          setErrors(result.status === "invalid" ? result.fields : []);
          if (result.status === "done") {
            hapticSuccess();
            toast.success(copy.reportDone);
            onDone();
          } else if (result.status !== "invalid") toast.error(t.money.passes.failed);
        });
      }}
    >
      <p className="text-subhead text-ink-2">{copy.reportText}</p>
      <PaymentFields
        values={values}
        onChange={setValues}
        symbol={currencySymbol(locale, data.pass.currency)}
        today={data.today}
        errors={{ amount: errors.includes("payment.amount"), paidOn: errors.includes("payment.paidOn") }}
      />
      <Button type="submit" size="lg" block loading={pending}>
        {copy.report}
      </Button>
    </form>
  );
}

function Withdraw({ paymentId }: { paymentId: string }) {
  const { t } = useI18n();
  const copy = t.money.client;
  const [pending, startTransition] = useTransition();
  return (
    <div>
      <Button
        size="sm"
        variant="ghost"
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await withdrawReport({ paymentId, reason: copy.withdrawReason });
            if (result.status === "done") toast.success(copy.withdrawn);
            else toast.error(result.status === "stale" ? t.money.passes.stale : t.money.passes.failed);
          })
        }
      >
        {copy.withdraw}
      </Button>
    </div>
  );
}

/**
 * The client's pass (screens.md "Абонемент"): the ring of what is left, dates and payment state, "Оплатить" to the
 * trainer's payment links (PRD 2.8-15), "Я оплатил" that only tells the trainer, the payments and the history.
 */
export function ClientPassDetail({ data }: { data: ClientPass }) {
  const { t } = useI18n();
  const copy = t.money.client;
  const [reporting, setReporting] = useState(false);
  const { pass } = data;
  const owes = pass.status !== "cancelled" && pass.unpaidMinor > 0;

  return (
    <div className="flex flex-col gap-6">
      <RemainingRing remaining={pass.remaining} total={pass.sessionsTotal} label={copy.remainingLabel} />
      <PassSummary pass={pass} />

      {owes ? (
        <section aria-labelledby="pay" className="flex flex-col gap-3 rounded-lg bg-surface-1 p-4">
          <h2 id="pay" className="text-headline">
            {copy.pay}
          </h2>
          {data.paymentLinks.length ? (
            <>
              <p className="text-subhead text-ink-2">{copy.payText}</p>
              <div className="flex flex-col gap-2">
                {data.paymentLinks.map((link) => (
                  <a
                    key={link.id}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(event) => {
                      if (openExternalLink(link.url)) event.preventDefault();
                    }}
                    className={cn(buttonVariants({ size: "lg", block: true }))}
                  >
                    <ExternalLink aria-hidden size={20} strokeWidth={1.75} />
                    {link.title}
                  </a>
                ))}
              </div>
            </>
          ) : (
            <p className="text-subhead text-ink-2">{copy.noLinks}</p>
          )}
          <Button variant="secondary" size="lg" block icon={Wallet} onClick={() => setReporting(true)}>
            {copy.report}
          </Button>
        </section>
      ) : null}

      <section aria-labelledby="client-payments" className="flex flex-col gap-1.5">
        <h2 id="client-payments" className="px-4 text-footnote text-ink-2">
          {copy.payments}
        </h2>
        {data.payments.length ? (
          <ul className="flex flex-col gap-2">
            {data.payments.map((payment) => (
              <PaymentItem key={payment.id} payment={payment} passTitle={pass.title} timeZone={data.timeZone}>
                {payment.reported && payment.status === "reported" ? <Withdraw paymentId={payment.id} /> : null}
              </PaymentItem>
            ))}
          </ul>
        ) : (
          <p className="rounded-lg bg-surface-1 px-4 py-3 text-subhead text-ink-2">{copy.noPayments}</p>
        )}
      </section>

      <PassHistory entries={pass.history} timeZone={data.timeZone} headingLevel={2} />

      <Sheet open={reporting} onOpenChange={setReporting} title={copy.reportTitle}>
        {reporting ? <ReportForm data={data} onDone={() => setReporting(false)} /> : null}
      </Sheet>
    </div>
  );
}
