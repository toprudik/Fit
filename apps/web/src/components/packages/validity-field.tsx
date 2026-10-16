"use client";

import { useId } from "react";
import { useI18n } from "@/i18n/client";
import { plural } from "@/i18n/format";
import { VALIDITY_DAYS } from "@/lib/packages/grid";

const SELECT_CLASS =
  "h-13 w-full rounded-sm border border-field-line bg-field px-4 text-body text-ink outline-none focus:border-focus-ring focus:shadow-[0_0_0_1px_var(--focus-ring)]";

/** "Срок действия": no expiry or one of the offered day counts (a pass ends at the end of its last day). */
export function ValidityField({ name, initial, hint, invalid }: { name: string; initial: string; hint?: string; invalid?: boolean }) {
  const { t, locale } = useI18n();
  const copy = t.money.packages.validity;
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="px-1 text-footnote text-ink-2">
        {copy.label}
      </label>
      <select
        id={id}
        name={name}
        defaultValue={(VALIDITY_DAYS as readonly number[]).includes(Number(initial)) ? initial : ""}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className={SELECT_CLASS}
      >
        <option value="">{copy.none}</option>
        {VALIDITY_DAYS.map((days) => (
          <option key={days} value={days}>
            {plural(locale, days, copy.days)}
          </option>
        ))}
      </select>
      {hint ? (
        <p id={`${id}-hint`} className="px-1 text-footnote text-ink-2">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
