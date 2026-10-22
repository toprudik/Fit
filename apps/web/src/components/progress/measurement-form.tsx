"use client";

import { Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/sonner";
import { DateField } from "@/components/ui/date-field";
import { TextField } from "@/components/ui/text-field";
import { useI18n } from "@/i18n/client";
import { addMeasurements } from "@/lib/progress/actions";
import { GIRTH_KINDS, parseMeasurement, unitOf, unitSystem, type MeasurementKind } from "@/lib/progress/measurements";

type Errors = Partial<Record<MeasurementKind | "date" | "form", string>>;

/**
 * "Добавить замер": a date, the weight and the girths, each optional but at least one (PRD wave-1 §2.11-1).
 * Values are typed in the interface's units and sent in kg and cm. With `coachingId` the trainer adds them for
 * the pair's client.
 */
export function AddMeasurement({ today, coachingId, block = false }: { today: string; coachingId?: string; block?: boolean }) {
  const { t, locale } = useI18n();
  const copy = t.progress.measurements;
  const system = unitSystem(locale);
  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    const next: Errors = {};
    const date = String(formData.get("date") ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today) next.date = copy.errors.date;
    const values: { kind: MeasurementKind; value: number }[] = [];
    for (const kind of ["weight", ...GIRTH_KINDS] as MeasurementKind[]) {
      const parsed = parseMeasurement(kind, String(formData.get(kind) ?? ""), unitOf(kind, system));
      if (parsed.ok) values.push({ kind, value: parsed.metric });
      else if (parsed.reason !== "empty") next[kind] = copy.errors[parsed.reason];
    }
    if (!values.length && !Object.keys(next).length) next.form = copy.errors.empty;
    setErrors(next);
    if (Object.keys(next).length) return;
    startTransition(async () => {
      const result = await addMeasurements({ coachingId, date, values });
      if (!result.ok) {
        toast.error(copy.failed);
        return;
      }
      setOpen(false);
      toast.success(copy.saved);
    });
  }

  const field = (kind: MeasurementKind) => (
    <TextField
      key={kind}
      name={kind}
      label={copy.kinds[kind]}
      suffix={copy.units[unitOf(kind, system)]}
      inputMode="decimal"
      autoComplete="off"
      error={errors[kind]}
    />
  );

  return (
    <>
      <Button
        icon={Plus}
        block={block}
        onClick={() => {
          setErrors({});
          setOpen(true);
        }}
      >
        {copy.add}
      </Button>
      <Sheet open={open} onOpenChange={(next) => !pending && setOpen(next)} title={copy.addTitle} description={copy.addText}>
        <form action={submit} noValidate className="flex flex-col gap-4">
          <DateField name="date" label={copy.date} defaultValue={today} max={today} required error={errors.date} />
          {field("weight")}
          <fieldset className="flex flex-col gap-4">
            <legend className="mb-2 px-1 text-headline">{copy.girths}</legend>
            <div className="grid grid-cols-2 gap-3">{GIRTH_KINDS.map(field)}</div>
          </fieldset>
          {errors.form ? (
            <p role="alert" className="px-1 text-footnote text-danger">
              {errors.form}
            </p>
          ) : null}
          <Button type="submit" size="lg" block loading={pending}>
            {copy.save}
          </Button>
        </form>
      </Sheet>
    </>
  );
}
