"use client";

import { useId, useState } from "react";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";

type TimeFieldProps = {
  label: string;
  /** Posts the time as "HH:MM", the way `<input type="time">` does. */
  name?: string;
  /** "HH:MM" or "" for none; with it the field is controlled. */
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** Minutes offered: every 5 by default. A saved time off the step still shows. */
  step?: number;
  /** An empty field stops the form with «Выбери время». */
  required?: boolean;
  hint?: string;
  error?: string;
  disabled?: boolean;
  className?: string;
};

const HOURS = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, "0"));
const TIME = /^(\d{2}):(\d{2})/;

const selectClasses =
  "h-13 min-w-0 flex-1 cursor-pointer rounded-sm border bg-field px-4 text-body text-ink tabular-nums outline-none focus:border-focus-ring focus:shadow-[0_0_0_1px_var(--focus-ring)] disabled:cursor-default disabled:opacity-(--opacity-disabled)";

/**
 * Time field (QA T14): hours 00–23 and minutes as two native lists, so a phone shows its wheel and the time always
 * reads 18:00, never 06:00 PM from an English system.
 */
export function TimeField({
  label,
  name,
  value: controlled,
  defaultValue = "",
  onChange,
  step = 5,
  required = false,
  hint,
  error,
  disabled = false,
  className,
}: TimeFieldProps) {
  const { t } = useI18n();
  const copy = t.common.timeField;
  const [own, setOwn] = useState(defaultValue);
  const value = controlled ?? own;
  const id = useId();
  const noteId = `${id}-note`;
  const note = error ?? hint;
  const match = TIME.exec(value);
  const hour = match?.[1] ?? "";
  const minute = match?.[2] ?? "";
  const minutes = Array.from({ length: Math.ceil(60 / step) }, (_, index) => String(index * step).padStart(2, "0"));
  if (minute && !minutes.includes(minute)) {
    minutes.push(minute);
    minutes.sort();
  }

  const set = (nextHour: string, nextMinute: string) => {
    // Picking the hour first fills the minutes with :00, so one choice already makes a time.
    const next = nextHour ? `${nextHour}:${nextMinute || "00"}` : "";
    if (controlled === undefined) setOwn(next);
    onChange?.(next);
  };
  const invalid = (event: React.FormEvent<HTMLSelectElement>) => event.currentTarget.setCustomValidity(copy.required);

  return (
    <fieldset data-slot="time-field" className={cn("flex min-w-0 flex-col gap-1.5", className)} aria-describedby={note ? noteId : undefined}>
      <legend className="mb-1.5 px-1 text-footnote text-ink-2">{label}</legend>
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <div className="flex items-center gap-2">
        <select
          aria-label={copy.hours}
          value={hour}
          disabled={disabled}
          required={required}
          onInvalid={invalid}
          onChange={(event) => {
            event.currentTarget.setCustomValidity("");
            set(event.target.value, minute);
          }}
          aria-invalid={error ? true : undefined}
          className={cn(selectClasses, error ? "border-danger" : "border-field-line")}
        >
          {!hour || !required ? <option value="">{copy.emptyHours}</option> : null}
          {HOURS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <span aria-hidden className="text-body text-ink-2">
          :
        </span>
        <select
          aria-label={copy.minutes}
          value={minute}
          disabled={disabled || !hour}
          onChange={(event) => set(hour, event.target.value)}
          aria-invalid={error ? true : undefined}
          className={cn(selectClasses, error ? "border-danger" : "border-field-line")}
        >
          {!minute ? <option value="">{copy.emptyMinutes}</option> : null}
          {minutes.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
      {note ? (
        <p id={noteId} className={cn("px-1 text-footnote", error ? "text-danger" : "text-ink-2")}>
          {note}
        </p>
      ) : null}
    </fieldset>
  );
}
