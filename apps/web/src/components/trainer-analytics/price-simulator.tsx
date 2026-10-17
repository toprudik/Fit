"use client";

import { useState } from "react";
import { ListGroup, ListRow } from "@/components/ui/list";
import { TextField } from "@/components/ui/text-field";
import { useI18n } from "@/i18n/client";
import { interpolate } from "@/i18n/format";
import { formatMoney } from "@/lib/money/format";
import { breakEvenChurn, forecast, MAX_CHURN } from "@/lib/trainer-analytics/simulator";

/** A whole percent typed into a field, kept between 0 and `max`. */
function percent(value: string, max: number): number {
  const number = Number(value.replace(",", "."));
  return Number.isFinite(number) ? Math.min(Math.max(number, 0), max) : 0;
}

/**
 * «Симулятор повышения цен» (PRD wave-2 §7 rule 7): monthly revenue per currency from the last three full months,
 * a raise and an expected share of clients who leave. It only computes; prices stay as they are.
 */
export function PriceSimulator({ base }: { base: { currency: string; monthlyMinor: number }[] }) {
  const { t, locale } = useI18n();
  const copy = t.trainerAnalytics.simulator;
  const [raiseText, setRaiseText] = useState("10");
  const [churnText, setChurnText] = useState("0");
  const raise = percent(raiseText, 100) / 100;
  const churn = percent(churnText, MAX_CHURN * 100) / 100;
  const breakEven = Math.round(breakEvenChurn(raise) * 1000) / 10;

  return (
    <section aria-labelledby="price-simulator" className="flex flex-col gap-3">
      <h2 id="price-simulator" className="px-1 text-headline">
        {copy.header}
      </h2>
      {base.length === 0 ? (
        <p className="px-1 text-callout text-ink-2">{copy.empty}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <TextField label={copy.raise} inputMode="decimal" value={raiseText} onChange={(event) => setRaiseText(event.target.value)} />
            <TextField label={copy.churn} inputMode="decimal" value={churnText} onChange={(event) => setChurnText(event.target.value)} />
          </div>
          {base.map(({ currency, monthlyMinor }) => {
            const next = forecast(monthlyMinor, raise, churn);
            const difference = next - monthlyMinor;
            return (
              <ListGroup key={currency} footer={copy.footer}>
                <ListRow title={copy.current} value={formatMoney(locale, monthlyMinor, currency)} />
                <ListRow title={copy.forecast} value={formatMoney(locale, next, currency)} />
                <ListRow
                  title={copy.difference}
                  value={`${difference > 0 ? "+" : ""}${formatMoney(locale, difference, currency)}`}
                />
                <ListRow title={interpolate(copy.breakEven, { share: breakEven.toLocaleString(locale) })} />
              </ListGroup>
            );
          })}
        </>
      )}
    </section>
  );
}
