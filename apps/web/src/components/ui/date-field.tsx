"use client";

import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Sheet } from "@/components/ui/sheet";
import { SelectChevron } from "@/components/ui/time-field";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";

type DateFieldProps = {
  label: string;
  /** Posts the date as "YYYY-MM-DD", the way `<input type="date">` does. */
  name?: string;
  /** "YYYY-MM-DD" or "" for none; with it the field is controlled. */
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** Earliest and latest day that can be picked, "YYYY-MM-DD". */
  min?: string;
  max?: string;
  /** The day the calendar opens on while the field is empty, "YYYY-MM-DD"; today by default. */
  openOn?: string;
  /** An empty field stops the form with «Выбери дату», as a required native field would. */
  required?: boolean;
  hint?: string;
  error?: string;
  disabled?: boolean;
  className?: string;
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const MONTHS = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, "0"));
const headerSelect =
  "h-11 w-full cursor-pointer appearance-none rounded-sm border border-field-line bg-field pr-7 pl-2.5 text-body text-ink outline-none focus:border-focus-ring focus:shadow-[0_0_0_1px_var(--focus-ring)]";

/** "YYYY-MM-DD" as a UTC midnight, so the calendar never shifts a day with the device's zone. */
function utc(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The device's today: picking happens on the device, so its calendar day is the one to mark. */
function localToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** The month as "YYYY-MM" plus or minus some months. */
function shiftMonth(month: string, by: number): string {
  const date = utc(`${month}-01`);
  date.setUTCMonth(date.getUTCMonth() + by);
  return iso(date).slice(0, 7);
}

/** The month's days in weeks from Monday, with nulls before the 1st and after the last day. */
export function monthWeeks(month: string): (string | null)[][] {
  const first = utc(`${month}-01`);
  const lead = (first.getUTCDay() + 6) % 7;
  const days: (string | null)[] = Array.from({ length: lead }, () => null);
  for (const day = new Date(first); iso(day).startsWith(month); day.setUTCDate(day.getUTCDate() + 1)) days.push(iso(day));
  while (days.length % 7 !== 0) days.push(null);
  return Array.from({ length: days.length / 7 }, (_, week) => days.slice(week * 7, week * 7 + 7));
}

/**
 * Date field (QA T7, T14): shows «22 октября 2026» in the app's language and opens a sheet with a month calendar
 * from Monday, whatever the device's locale; a native date input shows 10/22/2026 and English validation on an
 * English system. Days outside min and max can't be picked.
 */
export function DateField({
  label,
  name,
  value: controlled,
  defaultValue = "",
  onChange,
  min,
  max,
  openOn,
  required = false,
  hint,
  error,
  disabled = false,
  className,
}: DateFieldProps) {
  const { t, locale } = useI18n();
  const copy = t.common.dateField;
  const [own, setOwn] = useState(defaultValue);
  const value = controlled ?? own;
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState("");
  const labelId = useId();
  const valueId = useId();
  const noteId = useId();
  const note = error ?? hint;

  const set = (next: string) => {
    if (controlled === undefined) setOwn(next);
    onChange?.(next);
  };
  const shown = ISO.test(value)
    ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(utc(value))
    : "";
  // «24 окт. 2026» without the calendar icon for a half-width field on a phone, where «24 октября 2026 г.» loses
  // its year to the ellipsis.
  const short = ISO.test(value)
    ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
        .format(utc(value))
        .replace(/\s*г\.$/, "")
    : "";
  const outside = (day: string) => (min !== undefined && day < min) || (max !== undefined && day > max);
  const today = open ? localToday() : "";
  // Month and year as lists, so a birth date forty years back is two taps, not 480 pages.
  const monthName = (option: string) => {
    const name = new Intl.DateTimeFormat(locale, { month: "long", timeZone: "UTC" }).format(utc(`2024-${option}-01`));
    return name.charAt(0).toUpperCase() + name.slice(1);
  };
  // Only while the sheet is open: a prerendered page can't read the clock (Cache Components).
  const thisYear = open ? new Date().getFullYear() : 0;
  const fromYear = min ? Number(min.slice(0, 4)) : thisYear - 100;
  const toYear = max ? Number(max.slice(0, 4)) : thisYear + 10;
  const shownYear = month ? Number(month.slice(0, 4)) : thisYear;
  const years = open
    ? Array.from({ length: Math.max(toYear, shownYear) - Math.min(fromYear, shownYear) + 1 }, (_, index) =>
        String(Math.max(toYear, shownYear) - index),
      )
    : [];
  const weekdays = Array.from({ length: 7 }, (_, index) =>
    // 2024-01-01 was a Monday.
    new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(utc(`2024-01-0${index + 1}`)),
  );

  const openSheet = () => {
    const start = ISO.test(value) ? value : openOn && ISO.test(openOn) ? openOn : localToday();
    const clamped = min && start < min ? min : max && start > max ? max : start;
    setMonth(clamped.slice(0, 7));
    setOpen(true);
  };

  return (
    <div data-slot="date-field" className={cn("relative flex flex-col gap-1.5", className)}>
      <span id={labelId} className="px-1 text-footnote text-ink-2">
        {label}
      </span>
      {name ? <input type="hidden" name={name} value={value} /> : null}
      {required && !value ? (
        // Native validation needs a field to hold: this one sits under the button, so the browser's bubble points at it.
        <input
          aria-hidden
          tabIndex={-1}
          required
          value=""
          onChange={() => undefined}
          onInvalid={(event) => event.currentTarget.setCustomValidity(copy.required)}
          className="pointer-events-none absolute bottom-0 left-4 h-px w-px opacity-0"
        />
      ) : null}
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-labelledby={`${labelId} ${valueId}`}
        aria-describedby={note ? noteId : undefined}
        onClick={openSheet}
        className={cn(
          "@container flex h-13 w-full cursor-pointer items-center gap-2 rounded-sm border bg-field px-4 text-left outline-none",
          "focus-visible:border-focus-ring focus-visible:shadow-[0_0_0_1px_var(--focus-ring)] disabled:cursor-default disabled:opacity-(--opacity-disabled)",
          error ? "border-danger" : "border-field-line",
        )}
      >
        <span
          id={valueId}
          className={cn("min-w-0 flex-1 truncate text-body", shown ? "text-ink" : "text-ink-3", short && "hidden @min-[14rem]:block")}
        >
          {shown || copy.empty}
        </span>
        {short ? (
          <span aria-hidden className="min-w-0 flex-1 truncate text-body text-ink @min-[14rem]:hidden">
            {short}
          </span>
        ) : null}
        <CalendarDays
          aria-hidden
          size={20}
          strokeWidth={1.75}
          className={cn("shrink-0 text-ink-2", short && "hidden @min-[14rem]:block")}
        />
      </button>
      {note ? (
        <p id={noteId} className={cn("px-1 text-footnote", error ? "text-danger" : "text-ink-2")}>
          {note}
        </p>
      ) : null}
      <Sheet open={open} onOpenChange={setOpen} title={label}>
        {month ? (
          <div className="flex flex-col gap-3 pb-4">
            <div className="flex items-center gap-2">
              <IconButton
                icon={ChevronLeft}
                label={copy.previous}
                disabled={min !== undefined && shiftMonth(month, -1) < min.slice(0, 7)}
                onClick={() => setMonth(shiftMonth(month, -1))}
              />
              <div className="relative min-w-0 flex-1">
                <select
                  aria-label={copy.month}
                  value={month.slice(5)}
                  onChange={(event) => setMonth(`${month.slice(0, 4)}-${event.target.value}`)}
                  className={headerSelect}
                >
                  {MONTHS.map((option) => (
                    <option key={option} value={option}>
                      {monthName(option)}
                    </option>
                  ))}
                </select>
                <SelectChevron className="right-2" />
              </div>
              <div className="relative min-w-0 flex-1">
                <select
                  aria-label={copy.year}
                  value={month.slice(0, 4)}
                  onChange={(event) => setMonth(`${event.target.value}-${month.slice(5)}`)}
                  className={headerSelect}
                >
                  {years.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <SelectChevron className="right-2" />
              </div>
              <IconButton
                icon={ChevronRight}
                label={copy.next}
                disabled={max !== undefined && shiftMonth(month, 1) > max.slice(0, 7)}
                onClick={() => setMonth(shiftMonth(month, 1))}
              />
            </div>
            <div aria-hidden className="grid grid-cols-7 text-center text-footnote text-ink-2">
              {weekdays.map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-y-1">
              {monthWeeks(month)
                .flat()
                .map((day, index) =>
                  day === null ? (
                    <span key={`blank-${index}`} />
                  ) : (
                    <button
                      key={day}
                      type="button"
                      disabled={outside(day)}
                      aria-pressed={day === value}
                      aria-current={day === today ? "date" : undefined}
                      aria-label={new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(utc(day))}
                      onClick={() => {
                        set(day);
                        setOpen(false);
                      }}
                      className={cn(
                        "mx-auto grid size-11 cursor-pointer place-items-center rounded-full text-body tabular-nums transition-[background-color] duration-[var(--duration-instant)] motion-reduce:transition-none",
                        "disabled:cursor-default disabled:text-ink-3",
                        day === value ? "bg-inverse text-on-inverse" : "text-ink hover:bg-surface-3 active:bg-surface-3",
                        day === today && day !== value && "font-semibold underline underline-offset-4",
                      )}
                    >
                      {Number(day.slice(8))}
                    </button>
                  ),
                )}
            </div>
            {!required && value ? (
              <Button
                variant="ghost"
                size="sm"
                className="self-center"
                onClick={() => {
                  set("");
                  setOpen(false);
                }}
              >
                {copy.clear}
              </Button>
            ) : null}
          </div>
        ) : null}
      </Sheet>
    </div>
  );
}
