"use client";

import { AlertCircle, CalendarClock, Wallet } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { ListGroup, ListRow } from "@/components/ui/list";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useI18n } from "@/i18n/client";
import { interpolate, plural } from "@/i18n/format";
import { formatMoney } from "@/lib/money/format";
import { withBooked } from "@/lib/passes/remaining";
import type { MoneyPayment, TrainerMoney } from "@/lib/passes/load";
import { formatLocalDay } from "@/lib/passes/present";
import { formatNoteTime } from "@/lib/pairs/format";
import { debtText } from "@/lib/passes/debt";

type View = "debts" | "payments" | "passes";

function PaymentRow({ payment, timeZone }: { payment: MoneyPayment; timeZone: string }) {
  const { t, locale } = useI18n();
  const copy = t.money.payments;
  const amount = formatMoney(locale, payment.amountMinor, payment.currency);
  return (
    <ListRow
      title={payment.name || t.botMessages.unnamedClient}
      subtitle={[payment.passTitle ?? copy.onAccount, copy.methods[payment.method], formatNoteTime(locale, payment.paidAt, timeZone), copy.status[payment.status]].join(", ")}
      value={payment.direction === "refund" ? `−${amount}` : amount}
      href={`/trainer/clients/${payment.coachingId}/payments`}
    />
  );
}

/**
 * /trainer/money (screens.md "Деньги"): what came in this month, then "Долги", "Оплаты" and "Абонементы" that run
 * out, across all clients. Each row opens the client's payments or passes.
 */
export function MoneyOverview({ money }: { money: TrainerMoney }) {
  const { t, locale } = useI18n();
  const copy = t.money.overview;
  const owed = money.debts.length + money.unpaid.length > 0;
  const [view, setView] = useState<View>(owed ? "debts" : "payments");
  const income = Object.entries(money.monthIncome).filter(([, minor]) => minor !== 0);
  const waiting = money.payments.filter((payment) => payment.status === "reported");
  const recent = money.payments.filter((payment) => payment.status !== "reported");

  return (
    <div className="flex flex-col gap-4">
      <section aria-labelledby="month-income" className="flex flex-col gap-1 rounded-lg bg-surface-1 p-4">
        <h2 id="month-income" className="text-footnote text-ink-2">
          {copy.month}
        </h2>
        {income.length ? (
          income.map(([currency, minor]) => (
            <p key={currency} className="text-num-xl tabular-nums">
              {formatMoney(locale, minor, currency)}
            </p>
          ))
        ) : (
          <p className="text-body text-ink-2">{copy.monthNone}</p>
        )}
      </section>

      <SegmentedControl
        label={copy.label}
        value={view}
        onValueChange={setView}
        options={[
          { value: "debts", label: copy.debts },
          { value: "payments", label: copy.payments },
          { value: "passes", label: copy.passes },
        ]}
      />

      {view === "debts" ? (
        owed ? (
          <>
            {money.debts.length ? (
              <ListGroup header={copy.debts}>
                {money.debts.map((item) => (
                  <ListRow
                    key={item.coachingId}
                    icon={AlertCircle}
                    title={item.name || t.botMessages.unnamedClient}
                    value={debtText(t, locale, item.debt)}
                    href={`/trainer/clients/${item.coachingId}/payments`}
                  />
                ))}
              </ListGroup>
            ) : null}
            {money.unpaid.length ? (
              <ListGroup header={copy.unpaid}>
                {money.unpaid.map((item) => (
                  <ListRow
                    key={item.id}
                    icon={Wallet}
                    title={item.name || t.botMessages.unnamedClient}
                    subtitle={item.title}
                    value={formatMoney(locale, item.unpaidMinor, item.currency)}
                    href={`/trainer/clients/${item.coachingId}/payments`}
                  />
                ))}
              </ListGroup>
            ) : null}
          </>
        ) : (
          <EmptyState icon={Wallet} title={copy.debtsEmpty} description={copy.debtsEmptyText} />
        )
      ) : null}

      {view === "payments" ? (
        money.payments.length ? (
          <>
            {waiting.length ? (
              <ListGroup header={copy.waiting}>
                {waiting.map((payment) => (
                  <PaymentRow key={payment.id} payment={payment} timeZone={money.timeZone} />
                ))}
              </ListGroup>
            ) : null}
            {recent.length ? (
              <ListGroup header={copy.recent}>
                {recent.map((payment) => (
                  <PaymentRow key={payment.id} payment={payment} timeZone={money.timeZone} />
                ))}
              </ListGroup>
            ) : null}
          </>
        ) : (
          <EmptyState icon={Wallet} title={copy.paymentsEmpty} description={copy.paymentsEmptyText} />
        )
      ) : null}

      {view === "passes" ? (
        money.ending.length ? (
          <ListGroup header={copy.ending}>
            {money.ending.map((pass) => (
              <ListRow
                key={pass.id}
                icon={CalendarClock}
                title={pass.name || t.botMessages.unnamedClient}
                subtitle={[
                  pass.title,
                  withBooked(t, plural(locale, pass.remaining, copy.left), pass),
                  pass.lastDay ? interpolate(t.money.passes.until, { date: formatLocalDay(locale, pass.lastDay) }) : null,
                ]
                  .filter(Boolean)
                  .join(", ")}
                href={`/trainer/clients/${pass.coachingId}/passes`}
              />
            ))}
          </ListGroup>
        ) : (
          <EmptyState icon={CalendarClock} title={copy.passesEmpty} description={copy.passesEmptyText} />
        )
      ) : null}
    </div>
  );
}
