"use client";

import { Pencil, Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/sonner";
import { TextField } from "@/components/ui/text-field";
import { useI18n } from "@/i18n/client";
import { interpolate } from "@/i18n/format";
import { clearPairTarget, setPairTarget } from "@/lib/nutrition/actions";
import { KCAL_MAX, KCAL_MIN, kcalOfMacros, macrosDisagree, minKcal, type CalcSex, type Macros } from "@/lib/nutrition/target";
import { formatValue } from "@/lib/progress/measurements";

type Field = "kcal" | "protein" | "fat" | "carbs";

const whole = (text: string, max: number): number | null | "invalid" => {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (!/^\d{1,5}$/.test(trimmed)) return "invalid";
  const value = Number(trimmed);
  return value <= max ? value : "invalid";
};

/**
 * "Задать норму" / "Изменить норму" on the client's "Питание" tab (wave-2 §2.11–2.12): kcal, optional macros with
 * a note when they disagree with the kcal by more than 5%, and a confirmation under 1200/1500 kcal.
 */
export function TrainerTargetForm({ coachingId, current, sex }: { coachingId: string; current: Macros | null; sex: CalcSex | null }) {
  const { t, locale } = useI18n();
  const copy = t.nutrition.trainer;
  const [open, setOpen] = useState(false);
  const [low, setLow] = useState<Omit<Parameters<typeof setPairTarget>[0], "confirmLow"> | null>(null);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [draft, setDraft] = useState<Macros | null>(current);
  const [pending, startTransition] = useTransition();

  function send(input: Omit<Parameters<typeof setPairTarget>[0], "confirmLow">, confirmLow: boolean) {
    startTransition(async () => {
      const result = await setPairTarget({ ...input, confirmLow });
      if (!result.ok && result.reason === "low") {
        setLow(input);
        return;
      }
      if (!result.ok) {
        toast.error(copy.failed);
        return;
      }
      setLow(null);
      setOpen(false);
      toast.success(copy.saved);
    });
  }

  function read(formData: FormData) {
    const values = {
      kcal: whole(String(formData.get("kcal") ?? ""), KCAL_MAX),
      protein: whole(String(formData.get("protein") ?? ""), 1000),
      fat: whole(String(formData.get("fat") ?? ""), 1000),
      carbs: whole(String(formData.get("carbs") ?? ""), 2000),
    };
    const next: Partial<Record<Field, string>> = {};
    if (typeof values.kcal !== "number" || values.kcal < KCAL_MIN) next.kcal = copy.errors.kcal;
    for (const field of ["protein", "fat", "carbs"] as const) if (values[field] === "invalid") next[field] = copy.errors.grams;
    setErrors(next);
    if (Object.keys(next).length || typeof values.kcal !== "number") return null;
    const grams = (value: number | null | "invalid") => (typeof value === "number" ? value : null);
    return { kcal: values.kcal, proteinG: grams(values.protein), fatG: grams(values.fat), carbsG: grams(values.carbs) };
  }

  function submit(formData: FormData) {
    const macros = read(formData);
    if (!macros) return;
    const input = { coachingId, ...macros };
    if (macros.kcal < minKcal(sex)) {
      setLow(input);
      return;
    }
    send(input, false);
  }

  const mismatch = draft && macrosDisagree(draft) ? kcalOfMacros(draft.proteinG, draft.fatG, draft.carbsG) : null;
  const field = (name: Field, label: string, unit: string, value: number | null | undefined) => (
    <TextField
      name={name}
      label={label}
      suffix={unit}
      inputMode="numeric"
      autoComplete="off"
      defaultValue={value == null ? undefined : String(value)}
      error={errors[name]}
    />
  );

  return (
    <>
      <Button
        icon={current ? Pencil : Plus}
        variant={current ? "secondary" : "primary"}
        onClick={() => {
          setErrors({});
          setDraft(current);
          setOpen(true);
        }}
      >
        {current ? copy.edit : copy.set}
      </Button>
      <Sheet open={open} onOpenChange={(next) => !pending && setOpen(next)} title={copy.formTitle} description={copy.formText}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit(new FormData(event.currentTarget));
          }}
          noValidate
          className="flex flex-col gap-4"
          onChange={(event) => {
            const form = new FormData(event.currentTarget);
            const number = (name: string) => {
              const value = whole(String(form.get(name) ?? ""), 10000);
              return typeof value === "number" ? value : null;
            };
            setDraft({ kcal: number("kcal") ?? 0, proteinG: number("protein"), fatG: number("fat"), carbsG: number("carbs") });
          }}
        >
          {field("kcal", copy.kcal, copy.units.kcal, current?.kcal)}
          <div className="grid grid-cols-3 gap-3">
            {field("protein", copy.protein, copy.units.g, current?.proteinG)}
            {field("fat", copy.fat, copy.units.g, current?.fatG)}
            {field("carbs", copy.carbs, copy.units.g, current?.carbsG)}
          </div>
          {mismatch !== null ? (
            <p role="status" className="px-1 text-footnote text-ink-2">
              {interpolate(copy.mismatch, { kcal: formatValue(locale, mismatch) })}
            </p>
          ) : null}
          <Button type="submit" size="lg" block loading={pending && !low}>
            {copy.save}
          </Button>
        </form>
      </Sheet>
      <Sheet
        open={low !== null}
        onOpenChange={(next) => !pending && !next && setLow(null)}
        title={interpolate(copy.lowTitle, { min: formatValue(locale, minKcal(sex)) })}
        description={copy.lowText}
        actions={
          <Button size="lg" block loading={pending} onClick={() => low && send(low, true)}>
            {copy.lowConfirm}
          </Button>
        }
      />
    </>
  );
}

/** "Убрать норму": the client's diary falls back to the next source from today (§2.5). */
export function ClearTargetButton({ coachingId }: { coachingId: string }) {
  const { t } = useI18n();
  const copy = t.nutrition.trainer;
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await clearPairTarget(coachingId);
          if (!result.ok) toast.error(copy.failed);
          else toast.success(copy.cleared);
        })
      }
    >
      {copy.clear}
    </Button>
  );
}
