"use client";

import { Plus, X } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Sheet } from "@/components/ui/sheet";
import { TextField } from "@/components/ui/text-field";
import { useI18n } from "@/i18n/client";
import { interpolate } from "@/i18n/format";
import {
  formatOffset,
  MAX_OFFSET,
  MAX_REMINDERS,
  MIN_OFFSET,
  REMINDER_PRESETS,
  sortOffsets,
  UNIT_MINUTES,
  type OffsetUnit,
} from "@/lib/reminders/offsets";

type ReminderEditorProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  initial: number[];
  /** Resolves true once saved; the sheet then closes. */
  onSave: (offsets: number[]) => Promise<boolean>;
};

const UNITS: OffsetUnit[] = ["minutes", "hours", "days"];

/**
 * Up to three reminders before a session (PRD 2.9-2, NOTIF-1): the presets 1 day, 3 hours, 1 hour and
 * 15 minutes as toggles, plus a custom time from 5 minutes to 7 days. A fourth one or a duplicate is refused
 * with a note instead of being saved. Each opening starts from `initial`.
 */
export function ReminderEditor({ open, onOpenChange, title, initial, onSave }: ReminderEditorProps) {
  const { t, locale } = useI18n();
  const copy = t.notificationSettings.editor;
  const units = t.reminders.units;
  const [selected, setSelected] = useState<number[]>(initial);
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState<OffsetUnit>("minutes");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [wasOpen, setWasOpen] = useState(open);

  // Each opening starts from the saved value.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setSelected(initial);
      setAmount("");
      setError(null);
    }
  }

  function add(offset: number): boolean {
    if (selected.includes(offset)) {
      setError(copy.duplicate);
      return false;
    }
    if (selected.length >= MAX_REMINDERS) {
      setError(copy.limit);
      return false;
    }
    setSelected(sortOffsets([...selected, offset]));
    setError(null);
    return true;
  }

  function remove(offset: number) {
    setSelected(selected.filter((value) => value !== offset));
    setError(null);
  }

  function addCustom() {
    const value = Number(amount);
    const offset = value * UNIT_MINUTES[unit];
    if (!Number.isInteger(value) || offset < MIN_OFFSET || offset > MAX_OFFSET) {
      setError(copy.range);
      return;
    }
    if (add(offset)) setAmount("");
  }

  function save() {
    startTransition(async () => {
      if (await onSave(selected)) onOpenChange(false);
    });
  }

  const label = (offset: number) =>
    interpolate(t.reminders.before, {
      time: formatOffset(locale, offset, units),
    });
  const custom = selected.filter((offset) => !(REMINDER_PRESETS as readonly number[]).includes(offset));

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      actions={
        <>
          <Button size="lg" block loading={pending} onClick={save}>
            {copy.save}
          </Button>
          <Button variant="ghost" size="lg" block onClick={() => onOpenChange(false)}>
            {copy.cancel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5 pb-2">
        <section className="flex flex-col gap-2" aria-labelledby="reminder-presets">
          <h3 id="reminder-presets" className="px-1 text-footnote text-ink-2">
            {copy.presets}
          </h3>
          <div className="flex flex-wrap gap-2">
            {REMINDER_PRESETS.map((offset) => {
              const on = selected.includes(offset);
              return (
                <Chip key={offset} selected={on} onClick={() => (on ? remove(offset) : add(offset))}>
                  {label(offset)}
                </Chip>
              );
            })}
            {custom.map((offset) => (
              <Chip key={offset} selected onClick={() => remove(offset)}>
                <span>{label(offset)}</span>
                <X aria-hidden size={14} />
                <span className="sr-only">{interpolate(copy.remove, { time: label(offset) })}</span>
              </Chip>
            ))}
          </div>
        </section>
        <section className="flex flex-col gap-2" aria-labelledby="reminder-custom">
          <h3 id="reminder-custom" className="px-1 text-footnote text-ink-2">
            {copy.custom}
          </h3>
          <div className="flex items-end gap-2">
            <TextField
              label={copy.value}
              inputMode="numeric"
              pattern="[0-9]*"
              value={amount}
              onChange={(event) => setAmount(event.target.value.replace(/\D/g, "").slice(0, 5))}
              className="w-24 shrink-0"
            />
            <Button variant="secondary" icon={Plus} onClick={addCustom} disabled={!amount}>
              {copy.add}
            </Button>
          </div>
          <SegmentedControl
            label={copy.unit}
            options={UNITS.map((value) => ({
              value,
              label: t.reminders.unitNames[value],
            }))}
            value={unit}
            onValueChange={setUnit}
          />
        </section>
        <p role="status" className="min-h-5 px-1 text-footnote text-danger">
          {error}
        </p>
      </div>
    </Sheet>
  );
}
