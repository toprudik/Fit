"use client";

import { Pencil } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ListGroup, ListRow } from "@/components/ui/list";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/sonner";
import { TextField } from "@/components/ui/text-field";
import { useI18n } from "@/i18n/client";
import { interpolate } from "@/i18n/format";
import { deleteMeasurement, updateMeasurement } from "@/lib/progress/actions";
import { formatMeasurement, formatValue, fromMetric, MEASUREMENT_KINDS, parseMeasurement, unitOf, unitSystem } from "@/lib/progress/measurements";
import type { MeasurementEntry } from "@/lib/progress/load";
import { formatLogDay } from "@/lib/workouts/present";

/**
 * Every entry by date, newest first, with who entered it (PROG-1). Only the author's own entries open the
 * editor; the rest are read-only rows.
 */
export function MeasurementHistory({ entries, today }: { entries: MeasurementEntry[]; today: string }) {
  const { t, locale } = useI18n();
  const copy = t.progress.measurements;
  const [editing, setEditing] = useState<MeasurementEntry | null>(null);
  const thisYear = Number(today.slice(0, 4));

  const days = new Map<string, MeasurementEntry[]>();
  for (const entry of entries) days.set(entry.date, [...(days.get(entry.date) ?? []), entry]);
  const order = (entry: MeasurementEntry) => MEASUREMENT_KINDS.indexOf(entry.kind);

  function authorLabel(entry: MeasurementEntry): string {
    if (entry.author.kind === "me") return copy.authors.me;
    if (entry.author.kind === "client") return copy.authors.client;
    return entry.author.name ? interpolate(copy.authors.trainer, { name: entry.author.name }) : copy.authors.trainerUnnamed;
  }

  return (
    <section className="flex flex-col gap-4" aria-label={copy.history}>
      <h2 className="px-4 text-headline">{copy.history}</h2>
      {[...days.entries()]
        .sort(([a], [b]) => (a < b ? 1 : -1))
        .map(([day, rows]) => (
          <ListGroup key={day} header={formatLogDay(locale, day, thisYear)} headingLevel={3}>
            {[...rows]
              .sort((a, b) => order(a) - order(b) || (a.at < b.at ? 1 : -1))
              .map((entry) => (
                <ListRow
                  key={entry.id}
                  title={copy.kinds[entry.kind]}
                  subtitle={authorLabel(entry)}
                  value={formatMeasurement(locale, entry.kind, entry.value, copy.units)}
                  onClick={entry.mine ? () => setEditing(entry) : undefined}
                  trailing={entry.mine ? <Pencil aria-hidden size={16} className="text-ink-3" /> : undefined}
                  chevron={false}
                />
              ))}
          </ListGroup>
        ))}
      {editing ? <EditMeasurement key={editing.id} entry={editing} onClose={() => setEditing(null)} thisYear={thisYear} /> : null}
    </section>
  );
}

function EditMeasurement({ entry, onClose, thisYear }: { entry: MeasurementEntry; onClose: () => void; thisYear: number }) {
  const { t, locale } = useI18n();
  const copy = t.progress.measurements;
  const unit = unitOf(entry.kind, unitSystem(locale));
  const [open, setOpen] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  function close() {
    setOpen(false);
    onClose();
  }

  function save(formData: FormData) {
    const parsed = parseMeasurement(entry.kind, String(formData.get("value") ?? ""), unit);
    if (!parsed.ok) {
      setError(parsed.reason === "empty" ? copy.errors.invalid : copy.errors[parsed.reason]);
      return;
    }
    setError(undefined);
    startTransition(async () => {
      const result = await updateMeasurement({ id: entry.id, kind: entry.kind, value: parsed.metric });
      if (!result.ok) {
        toast.error(copy.failed);
        return;
      }
      close();
      toast.success(copy.saved);
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteMeasurement(entry.id);
      if (!result.ok) {
        toast.error(copy.failed);
        return;
      }
      close();
      toast.success(copy.deleted);
    });
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => !pending && !next && close()}
      title={copy.edit}
      description={interpolate(copy.editText, { kind: copy.kinds[entry.kind], date: formatLogDay(locale, entry.date, thisYear) })}
    >
      <form action={save} noValidate className="flex flex-col gap-4">
        <TextField
          name="value"
          label={copy.value}
          suffix={copy.units[unit]}
          inputMode="decimal"
          autoComplete="off"
          defaultValue={formatValue(locale, fromMetric(entry.value, unit))}
          error={error}
        />
        <div className="flex flex-col gap-2">
          <Button type="submit" size="lg" block loading={pending && !confirming}>
            {copy.save}
          </Button>
          <Button
            type="button"
            variant={confirming ? "destructive" : "ghost"}
            size="lg"
            block
            loading={pending && confirming}
            disabled={pending}
            onClick={() => (confirming ? remove() : setConfirming(true))}
          >
            {confirming ? copy.deleteConfirm : copy.delete}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
