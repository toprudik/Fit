"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { TextField } from "@/components/ui/text-field";
import { useI18n } from "@/i18n/client";
import { addMeasurements } from "@/lib/progress/actions";
import { parseMeasurement, unitOf, unitSystem } from "@/lib/progress/measurements";

/**
 * Quick weight entry on the client's home (screens.md §3.1): today's weight in one field, sent in kg. The full
 * form with the date and the girths stays on /client/progress.
 */
export function QuickWeight({ today }: { today: string }) {
  const { t, locale } = useI18n();
  const copy = t.progress.measurements;
  const unit = unitOf("weight", unitSystem(locale));
  const form = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    const parsed = parseMeasurement("weight", String(formData.get("weight") ?? ""), unit);
    if (!parsed.ok) {
      setError(parsed.reason === "empty" ? copy.errors.empty : copy.errors[parsed.reason]);
      return;
    }
    setError(undefined);
    startTransition(async () => {
      const result = await addMeasurements({ date: today, values: [{ kind: "weight", value: parsed.metric }] });
      if (!result.ok) {
        toast.error(copy.failed);
        return;
      }
      form.current?.reset();
      toast.success(copy.saved);
    });
  }

  return (
    <form ref={form} action={submit} noValidate className="flex items-start gap-2">
      <TextField
        name="weight"
        label={t.screens.client.home.weight}
        suffix={copy.units[unit]}
        inputMode="decimal"
        autoComplete="off"
        error={error}
        className="min-w-0 flex-1"
      />
      <Button type="submit" disabled={pending} className="mt-6">
        {t.screens.client.home.weightSave}
      </Button>
    </form>
  );
}
