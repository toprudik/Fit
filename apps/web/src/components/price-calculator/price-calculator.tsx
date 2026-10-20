"use client";

import Link from "next/link";
import { useState } from "react";
import { PriceGrid } from "@/components/packages/price-grid";
import { Button } from "@/components/ui/button";
import { ChipRadio } from "@/components/ui/chip";
import { TextField } from "@/components/ui/text-field";
import { useI18n } from "@/i18n/client";
import { interpolate } from "@/i18n/format";
import { currencySymbol, majorText, parseMajor } from "@/lib/money/format";
import { priceGrid, TEMPLATE, templatePrices } from "@/lib/packages/grid";
import { packageTitle, priceGridItems } from "@/lib/packages/present";
import { CURRENCIES, type Currency } from "@/lib/trainer-wizard/options";

/** What the drop-in field starts with, per currency: a typical session price, so the grid shows at once. */
const START_DROP_IN: Record<Currency, string> = { RUB: "2000", USD: "40", EUR: "40", KZT: "10000" };

type Props = {
  /** The link of «Вести абонементы в DaFit», with the visit's channel label already on it. */
  ctaHref: string;
};

/**
 * The public pass price calculator (marketing backlog item 9): the drop-in price, each pack of the 1/5/10/20
 * template prefilled at 10/20/25 % off until the visitor types their own, and the grid the way clients see it
 * in DaFit. Nothing is sent anywhere; the same rules as the trainer's template (lib/packages/grid).
 */
export function PriceCalculator({ ctaHref }: Props) {
  const { t, locale } = useI18n();
  const copy = t.priceCalculator;
  const [currency, setCurrency] = useState<Currency>(locale === "ru" ? "RUB" : "USD");
  const [dropIn, setDropIn] = useState(START_DROP_IN[currency]);
  // A pack the visitor has not touched follows the drop-in price; typed ones stay as typed.
  const [typed, setTyped] = useState<Partial<Record<number, string>>>({});

  const symbol = currencySymbol(locale, currency);
  const dropInMinor = parseMajor(dropIn);
  const suggested = new Map((dropInMinor ? templatePrices(dropInMinor) : []).map((pack) => [pack.sessions, majorText(pack.priceMinor)]));
  const packText = (sessions: number) => typed[sessions] ?? suggested.get(sessions) ?? "";
  const packInvalid = (sessions: number) => packText(sessions) !== "" && parseMajor(packText(sessions)) === null;

  const rows =
    dropInMinor && dropInMinor > 0
      ? priceGrid([
          { id: "1", sessionsCount: 1, priceMinor: dropInMinor, currency, appliesTo: "any" as const },
          ...TEMPLATE.flatMap(({ sessions }) => {
            const price = parseMajor(packText(sessions));
            return price ? [{ id: String(sessions), sessionsCount: sessions, priceMinor: price, currency, appliesTo: "any" as const }] : [];
          }),
        ])
      : [];

  const pickCurrency = (next: Currency) => {
    setCurrency(next);
    setDropIn(START_DROP_IN[next]);
    setTyped({});
  };

  return (
    <div className="grid gap-8 md:grid-cols-2 md:items-start">
      <div className="flex flex-col gap-5">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 px-1 text-footnote text-ink-2">{copy.currency}</legend>
          <div className="flex flex-wrap gap-2">
            {CURRENCIES.map((code) => (
              <ChipRadio key={code} name="currency" value={code} checked={code === currency} onChange={() => pickCurrency(code)}>
                {currencySymbol(locale, code) === code ? code : `${code} ${currencySymbol(locale, code)}`}
              </ChipRadio>
            ))}
          </div>
        </fieldset>
        <TextField
          label={copy.dropIn}
          hint={copy.dropInHint}
          inputMode="decimal"
          suffix={symbol}
          value={dropIn}
          onChange={(event) => setDropIn(event.target.value)}
          error={dropIn !== "" && !dropInMinor ? copy.dropInError : undefined}
          autoComplete="off"
        />
        {TEMPLATE.map(({ sessions, discountPct }) => (
          <TextField
            key={sessions}
            label={interpolate(copy.packPrice, { count: packageTitle(t, locale, sessions) })}
            hint={interpolate(copy.packHint, { pct: discountPct })}
            inputMode="decimal"
            suffix={symbol}
            value={packText(sessions)}
            onChange={(event) => setTyped((current) => ({ ...current, [sessions]: event.target.value }))}
            error={packInvalid(sessions) ? copy.packError : undefined}
            autoComplete="off"
          />
        ))}
      </div>

      <div className="flex flex-col gap-5">
        <section aria-labelledby="calculator-grid" aria-live="polite" className="flex flex-col gap-1.5">
          <h2 id="calculator-grid" className="px-4 text-footnote text-ink-2">
            {copy.gridTitle}
          </h2>
          {rows.length > 0 ? (
            <PriceGrid
              bestLabel={copy.best}
              items={priceGridItems(
                rows.map((row) => ({
                  key: row.id,
                  title: packageTitle(t, locale, row.sessionsCount),
                  sessionsCount: row.sessionsCount,
                  priceMinor: row.priceMinor,
                  currency,
                  perSessionMinor: row.perSessionMinor,
                  savingsPct: row.savingsPct,
                  isBestValue: row.isBestValue,
                  validityDays: null,
                })),
                t,
                locale,
              )}
            />
          ) : (
            <p className="rounded-lg bg-surface-1 p-4 text-subhead text-ink-2">{copy.gridEmpty}</p>
          )}
        </section>
        <section aria-labelledby="calculator-tips" className="flex flex-col gap-3">
          <h2 id="calculator-tips" className="text-title-3">
            {copy.tipsTitle}
          </h2>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-subhead text-ink-2">
            {copy.tips.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </section>
        <div className="flex flex-col gap-2 rounded-xl bg-surface-1 p-5">
          <p className="text-callout">{copy.ctaText}</p>
          <Button asChild size="lg" block>
            <Link href={ctaHref}>{copy.cta}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
