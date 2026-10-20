"use client";

import { useState } from "react";
import { TextField } from "@/components/ui/text-field";
import { useI18n } from "@/i18n/client";
import { interpolate } from "@/i18n/format";
import { majorText, parseMajor } from "@/lib/money/format";
import { priceGrid, TEMPLATE, templatePrices } from "@/lib/packages/grid";
import { packageTitle, priceGridItems } from "@/lib/packages/present";
import { PriceGrid } from "./price-grid";
import { ValidityField } from "./validity-field";

type PackField = "p5" | "p10" | "p20";

const packField = (sessions: number) => `p${sessions}` as PackField;

/**
 * The template 1/5/10/20 (PRD wave-1 §2.8 rule 2): the drop-in price, then each pack prefilled at 10/20/25 %
 * off until the trainer types their own, and the grid as clients will see it. Used by the price grid step of
 * the wizard and by /trainer/money/packages, inside their own forms.
 */
export function TemplateFields({
  currency,
  symbol,
  values,
  error,
}: {
  /** ISO code of the trainer's default currency. */
  currency: string;
  /** "₽", after each price. */
  symbol: string;
  /** What was sent, when the form came back. */
  values: Record<string, string | string[]> | null;
  error: (field: string) => boolean;
}) {
  const { t, locale } = useI18n();
  const copy = t.money.packages;
  const sent = (name: string) => {
    const value = values?.[name];
    return typeof value === "string" ? value : "";
  };
  const [dropIn, setDropIn] = useState(sent("dropIn"));
  // A pack the trainer has not touched follows the drop-in price; typed ones stay as typed.
  const [typed, setTyped] = useState<Partial<Record<PackField, string>>>(() =>
    // Empty fields of a rejected form are not typed: they keep following the drop-in price.
    Object.fromEntries(
      TEMPLATE.flatMap(({ sessions }) => {
        const value = sent(packField(sessions));
        return value ? [[packField(sessions), value]] : [];
      }),
    ),
  );

  const dropInMinor = parseMajor(dropIn);
  const suggested = new Map((dropInMinor ? templatePrices(dropInMinor) : []).map((pack) => [pack.sessions, majorText(pack.priceMinor)]));
  const packText = (sessions: number) => typed[packField(sessions)] ?? suggested.get(sessions) ?? "";

  const preview =
    dropInMinor && dropInMinor > 0
      ? priceGrid([
          { id: "1", sessionsCount: 1, priceMinor: dropInMinor, currency, appliesTo: "any" as const },
          ...TEMPLATE.flatMap(({ sessions }) => {
            const price = parseMajor(packText(sessions));
            return price === null ? [] : [{ id: String(sessions), sessionsCount: sessions, priceMinor: price, currency, appliesTo: "any" as const }];
          }),
        ])
      : [];

  return (
    <>
      <input type="hidden" name="locale" value={locale} />
      <TextField
        name="dropIn"
        label={copy.template.dropIn}
        inputMode="decimal"
        suffix={symbol}
        value={dropIn}
        onChange={(event) => setDropIn(event.target.value)}
        error={error("dropIn") ? copy.template.dropInError : undefined}
        autoComplete="off"
      />
      {TEMPLATE.map(({ sessions }) => (
        <TextField
          key={sessions}
          name={packField(sessions)}
          label={interpolate(copy.template.packPrice, { count: packageTitle(t, locale, sessions) })}
          inputMode="decimal"
          suffix={symbol}
          value={packText(sessions)}
          onChange={(event) => setTyped((current) => ({ ...current, [packField(sessions)]: event.target.value }))}
          hint={copy.template.packHint}
          error={error(packField(sessions)) ? copy.template.packError : undefined}
          autoComplete="off"
        />
      ))}
      <ValidityField name="validity" initial={sent("validity")} hint={copy.template.validityHint} invalid={error("validity")} />
      {preview.length > 0 ? (
        <section aria-labelledby="template-preview" className="flex flex-col gap-1.5">
          <h3 id="template-preview" className="px-4 text-footnote text-ink-2">
            {copy.grid.title}
          </h3>
          <PriceGrid
            bestLabel={copy.grid.best}
            items={priceGridItems(
              preview.map((row) => ({
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
        </section>
      ) : null}
    </>
  );
}
