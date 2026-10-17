"use client";

import { Pencil, Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/sonner";
import { TextField } from "@/components/ui/text-field";
import { useI18n } from "@/i18n/client";
import { interpolate } from "@/i18n/format";
import { clearGroupTarget, setGroupTarget, type TemplateInput } from "@/lib/groups/actions";
import type { Template } from "@/lib/groups/load";
import { KCAL_MAX, KCAL_MIN, minKcal } from "@/lib/nutrition/target";
import { formatValue } from "@/lib/progress/measurements";

type Field = "kcal" | "protein" | "fat" | "carbs" | "water" | "steps";
const LIMITS: Record<Field, number> = { kcal: KCAL_MAX, protein: 1000, fat: 1000, carbs: 2000, water: 10000, steps: 100000 };

const whole = (text: string, max: number): number | null | "invalid" => {
  const trimmed = text.replace(/\s/g, "");
  if (!trimmed) return null;
  if (!/^\d{1,6}$/.test(trimmed)) return "invalid";
  const value = Number(trimmed);
  return value <= max ? value : "invalid";
};

/**
 * "Шаблон нормы" of a group (PRD wave-2 §6 rules 2 and 6): kcal with optional macros, water and steps. The sheet
 * says how many clients get the new target from today before saving; under 1200 kcal it asks once more.
 */
export function GroupTargetForm({ groupId, current, impact }: { groupId: string; current: Template | null; impact: number }) {
  const { t, locale } = useI18n();
  const copy = t.trainerGroups.template;
  const [open, setOpen] = useState(false);
  const [low, setLow] = useState<Omit<TemplateInput, "confirmLow"> | null>(null);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [pending, startTransition] = useTransition();

  function send(input: Omit<TemplateInput, "confirmLow">, confirmLow: boolean) {
    startTransition(async () => {
      const result = await setGroupTarget({ ...input, confirmLow });
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

  function submit(form: FormData) {
    const values = Object.fromEntries(
      (Object.keys(LIMITS) as Field[]).map((field) => [field, whole(String(form.get(field) ?? ""), LIMITS[field])]),
    ) as Record<Field, number | null | "invalid">;
    const next: Partial<Record<Field, string>> = {};
    if (typeof values.kcal !== "number" || values.kcal < KCAL_MIN) next.kcal = copy.errors.kcal;
    for (const field of ["protein", "fat", "carbs", "water", "steps"] as const) if (values[field] === "invalid") next[field] = copy.errors.number;
    setErrors(next);
    if (Object.keys(next).length || typeof values.kcal !== "number") return;
    const value = (field: Field) => (typeof values[field] === "number" ? (values[field] as number) : null);
    const input = {
      groupId,
      kcal: values.kcal,
      proteinG: value("protein"),
      fatG: value("fat"),
      carbsG: value("carbs"),
      waterMl: value("water"),
      steps: value("steps"),
    };
    if (values.kcal < minKcal(null)) {
      setLow(input);
      return;
    }
    send(input, false);
  }

  const field = (name: Field, label: string, unit: string, initial: number | null | undefined) => (
    <TextField
      name={name}
      label={label}
      suffix={unit}
      inputMode="numeric"
      autoComplete="off"
      defaultValue={initial == null ? undefined : String(initial)}
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
          setOpen(true);
        }}
      >
        {current ? copy.edit : copy.set}
      </Button>
      <Sheet
        open={open}
        onOpenChange={(next) => !pending && setOpen(next)}
        title={copy.header}
        description={impact > 0 ? interpolate(copy.impact, { count: impact }) : copy.impactNone}
      >
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit(new FormData(event.currentTarget));
          }}
        >
          {field("kcal", copy.kcal, copy.units.kcal, current?.kcal)}
          <div className="grid grid-cols-3 gap-3">
            {field("protein", copy.protein, copy.units.g, current?.proteinG)}
            {field("fat", copy.fat, copy.units.g, current?.fatG)}
            {field("carbs", copy.carbs, copy.units.g, current?.carbsG)}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {field("water", copy.water, copy.units.ml, current?.waterMl)}
            {field("steps", copy.steps, copy.units.steps, current?.steps)}
          </div>
          <Button type="submit" size="lg" block loading={pending && !low}>
            {copy.save}
          </Button>
        </form>
      </Sheet>
      <Sheet
        open={low !== null}
        onOpenChange={(next) => !pending && !next && setLow(null)}
        title={interpolate(copy.lowTitle, { min: formatValue(locale, minKcal(null)) })}
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

/** "Убрать шаблон": members fall back to their next target source from today. */
export function ClearGroupTargetButton({ groupId }: { groupId: string }) {
  const { t } = useI18n();
  const copy = t.trainerGroups.template;
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await clearGroupTarget(groupId);
          if (!result.ok) toast.error(copy.failed);
          else toast.success(copy.cleared);
        })
      }
    >
      {copy.clear}
    </Button>
  );
}
