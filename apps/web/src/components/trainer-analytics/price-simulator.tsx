"use client";

import { useState } from "react";
import { ListGroup, ListRow } from "@/components/ui/list";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { TextField } from "@/components/ui/text-field";
import { useI18n } from "@/i18n/client";
import { interpolate } from "@/i18n/format";
import { currencySymbol, formatMoney, majorText, parseMajor } from "@/lib/money/format";
import { gridRaise, type SimulatorPackage } from "@/lib/trainer-analytics/grid-raise";
import { breakEvenChurn, forecast, MAX_CHURN } from "@/lib/trainer-analytics/simulator";

type Mode = "percent" | "grid";

/** A whole percent typed into a field, kept between 0 and `max`. */
function percent(value: string, max: number): number {
  const number = Number(value.replace(",", "."));
  return Number.isFinite(number) ? Math.min(Math.max(number, 0), max) : 0;
}

/** A fraction as a percent with one decimal: 0.1667 → 16.7. */
function oneDecimal(fraction: number): number {
  return Math.round(fraction * 1000) / 10;
}

/**
 * «Симулятор повышения цен» (PRD wave-2 §7 rule 7): monthly revenue per currency from the last three full months,
 * a raise and an expected share of clients who leave. The raise is either a percent or new prices for the packages
 * of the price grid (lib/trainer-analytics/grid-raise.ts). It only computes; prices stay as they are.
 */
export function PriceSimulator({
  base,
  packages = [],
}: {
  base: { currency: string; monthlyMinor: number }[];
  packages?: SimulatorPackage[];
}) {
  const { t, locale } = useI18n();
  const copy = t.trainerAnalytics.simulator;
  const [mode, setMode] = useState<Mode>("percent");
  const [raiseText, setRaiseText] = useState("10");
  const [churnText, setChurnText] = useState("0");
  const [priceTexts, setPriceTexts] = useState<Record<string, string>>(() =>
    Object.fromEntries(packages.map((item) => [item.id, majorText(item.priceMinor)])),
  );
  const churn = percent(churnText, MAX_CHURN * 100) / 100;
  const priced = packages.filter((item) => item.priceMinor > 0);
  const gridOffered = base.some(({ currency }) => priced.some((item) => item.currency === currency));
  const byGrid = gridOffered && mode === "grid";
  const newPrices = new Map(priced.map((item) => [item.id, parseMajor(priceTexts[item.id] ?? "")]));

  return (
    <section aria-labelledby="price-simulator" className="flex flex-col gap-3">
      <h2 id="price-simulator" className="px-1 text-headline">
        {copy.header}
      </h2>
      {base.length === 0 ? (
        <p className="px-1 text-callout text-ink-2">{copy.empty}</p>
      ) : (
        <>
          {gridOffered ? (
            <SegmentedControl
              label={copy.mode}
              value={mode}
              onValueChange={setMode}
              options={[
                { value: "percent", label: copy.byPercent },
                { value: "grid", label: copy.byGrid },
              ]}
            />
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            {byGrid ? null : (
              <TextField label={copy.raise} inputMode="decimal" value={raiseText} onChange={(event) => setRaiseText(event.target.value)} />
            )}
            <TextField label={copy.churn} inputMode="decimal" value={churnText} onChange={(event) => setChurnText(event.target.value)} />
          </div>
          {base.map(({ currency, monthlyMinor }) => {
            const own = priced.filter((item) => item.currency === currency);
            const raise = byGrid ? gridRaise(own, newPrices) : percent(raiseText, 100) / 100;
            const next = forecast(monthlyMinor, raise, churn);
            const difference = next - monthlyMinor;
            return (
              <div key={currency} className="flex flex-col gap-3">
                {byGrid ? (
                  own.length === 0 ? (
                    <p className="px-1 text-callout text-ink-2">{copy.gridEmpty}</p>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {own.map((item) => {
                        const text = priceTexts[item.id] ?? "";
                        return (
                          <TextField
                            key={item.id}
                            label={item.title}
                            inputMode="decimal"
                            suffix={currencySymbol(locale, currency)}
                            value={text}
                            hint={interpolate(copy.now, { price: formatMoney(locale, item.priceMinor, currency) })}
                            error={newPrices.get(item.id) === null ? copy.priceError : undefined}
                            onChange={(event) => setPriceTexts((texts) => ({ ...texts, [item.id]: event.target.value }))}
                          />
                        );
                      })}
                    </div>
                  )
                ) : null}
                <ListGroup footer={byGrid ? `${copy.gridFooter} ${copy.footer}` : copy.footer}>
                  {byGrid && own.length > 0 ? (
                    <ListRow title={interpolate(copy.gridRaise, { raise: `${raise > 0 ? "+" : ""}${oneDecimal(raise).toLocaleString(locale)}` })} />
                  ) : null}
                  <ListRow title={copy.current} value={formatMoney(locale, monthlyMinor, currency)} />
                  <ListRow title={copy.forecast} value={formatMoney(locale, next, currency)} />
                  <ListRow
                    title={copy.difference}
                    value={`${difference > 0 ? "+" : ""}${formatMoney(locale, difference, currency)}`}
                  />
                  <ListRow title={interpolate(copy.breakEven, { share: oneDecimal(breakEvenChurn(raise)).toLocaleString(locale) })} />
                </ListGroup>
              </div>
            );
          })}
        </>
      )}
    </section>
  );
}
