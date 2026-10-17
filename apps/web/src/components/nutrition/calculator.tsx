"use client";

import { useState, useTransition } from "react";
import { ChoiceList } from "@/components/passes/choice-list";
import { Button } from "@/components/ui/button";
import { ChipRadio } from "@/components/ui/chip";
import { toast } from "@/components/ui/sonner";
import { TextField } from "@/components/ui/text-field";
import { useI18n } from "@/i18n/client";
import { interpolate } from "@/i18n/format";
import { calculateNutrition, saveCalculatorTarget } from "@/lib/nutrition/actions";
import {
  ACTIVITY_LEVELS,
  CALC_SEXES,
  GOALS,
  HEIGHT_MAX_CM,
  HEIGHT_MIN_CM,
  WEIGHT_MAX_KG,
  WEIGHT_MIN_KG,
  minKcal,
  type ActivityLevel,
  type CalcResult,
  type CalcSex,
  type Goal,
} from "@/lib/nutrition/target";
import { formatMeasurement, formatValue, fromMetric, toMetric, unitSystem } from "@/lib/progress/measurements";
import { TargetCard } from "./target-card";

type Field = "goal" | "sex" | "birthDate" | "height" | "weight";

/** A number typed in the interface's unit, in metric, or null when it is not a number in range. */
function parseMetric(text: string, unit: "kg" | "lb" | "cm" | "in", min: number, max: number): number | null {
  const trimmed = text.trim().replace(",", ".");
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(trimmed)) return null;
  const metric = toMetric(Number(trimmed), unit);
  return metric >= min && metric <= max ? metric : null;
}

/**
 * The Mifflin-St Jeor calculator (wave-2 §2): goal, sex, date of birth, height, weight and activity. "Рассчитать"
 * saves the inputs and the goal and shows the result; it becomes the target only on "Сделать нормой", so a new
 * goal shows the new numbers before anything changes (§1.3).
 */
export function NutritionCalculator({
  initial,
  latestWeightKg,
  today,
  trainerName,
}: {
  initial: { goal: Goal | null; sex: CalcSex | null; birthDate: string | null; heightCm: number | null; activity: ActivityLevel | null };
  latestWeightKg: number | null;
  today: string;
  /** Set when a trainer's target is active: the calculation is saved but the diary keeps the trainer's target. */
  trainerName: string | null;
}) {
  const { t, locale } = useI18n();
  const copy = t.nutrition.calc;
  const system = unitSystem(locale);
  const heightUnit = system === "imperial" ? "in" : "cm";
  const weightUnit = system === "imperial" ? "lb" : "kg";
  const [goal, setGoal] = useState<Goal | null>(initial.goal);
  const [sex, setSex] = useState<CalcSex | null>(initial.sex);
  const [activity, setActivity] = useState<ActivityLevel>(initial.activity ?? "moderate");
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [result, setResult] = useState<{ value: CalcResult; weightKg: number } | null>(null);
  const [pending, startTransition] = useTransition();
  const [saving, startSaving] = useTransition();

  const shown = (metric: number | null, unit: "kg" | "lb" | "cm" | "in") =>
    metric === null ? undefined : String(Math.round(fromMetric(metric, unit) * 10) / 10).replace(".", locale === "ru" ? "," : ".");

  function submit(formData: FormData) {
    const birthDate = String(formData.get("birthDate") ?? "");
    const heightCm = parseMetric(String(formData.get("height") ?? ""), heightUnit, HEIGHT_MIN_CM, HEIGHT_MAX_CM);
    const weightKg = parseMetric(String(formData.get("weight") ?? ""), weightUnit, WEIGHT_MIN_KG, WEIGHT_MAX_KG);
    const next: Partial<Record<Field, string>> = {};
    if (!goal) next.goal = copy.errors.goal;
    if (!sex) next.sex = copy.errors.sex;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || birthDate >= today || birthDate < "1900-01-02") next.birthDate = copy.errors.birthDate;
    if (heightCm === null) next.height = copy.errors.height;
    if (weightKg === null) next.weight = copy.errors.weight;
    setErrors(next);
    if (Object.keys(next).length || !goal || !sex || heightCm === null || weightKg === null) return;
    startTransition(async () => {
      const response = await calculateNutrition({ goal, sex, birthDate, heightCm, activity, weightKg });
      if (!response.ok) {
        toast.error(copy.failed);
        return;
      }
      setResult({ value: response.result, weightKg });
    });
  }

  function save(weightKg: number) {
    startSaving(async () => {
      const response = await saveCalculatorTarget(weightKg);
      if (!response.ok) {
        toast.error(copy.failed);
        return;
      }
      setResult(null);
      toast.success(copy.saved);
    });
  }

  const radioGroup = <T extends string>(
    name: string,
    legend: string,
    values: readonly T[],
    label: (value: T) => string,
    selected: T | null,
    select: (value: T) => void,
    error?: string,
  ) => (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 px-1 text-footnote text-ink-2">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {values.map((value) => (
          <ChipRadio key={value} name={name} value={value} checked={selected === value} onChange={() => select(value)}>
            {label(value)}
          </ChipRadio>
        ))}
      </div>
      {error ? (
        <p role="alert" className="px-1 text-footnote text-danger">
          {error}
        </p>
      ) : null}
    </fieldset>
  );

  return (
    <section aria-labelledby="nutrition-calculator" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1 px-4">
        <h2 id="nutrition-calculator" className="text-headline">
          {copy.title}
        </h2>
        <p className="text-subhead text-ink-2">{copy.text}</p>
      </div>
      {/* onSubmit, not action: a form action resets the form afterwards, which would clear the picked chips. */}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit(new FormData(event.currentTarget));
        }}
        noValidate
        className="flex flex-col gap-5 rounded-lg bg-surface-1 p-4"
      >
        {radioGroup("goal", t.nutrition.goalLabel, GOALS, (value) => t.nutrition.goals[value], goal, setGoal, errors.goal)}
        {radioGroup("sex", copy.sex, CALC_SEXES, (value) => copy.sexes[value], sex, setSex, errors.sex)}
        <TextField
          name="birthDate"
          type="date"
          label={copy.birthDate}
          defaultValue={initial.birthDate ?? undefined}
          max={today}
          required
          error={errors.birthDate}
        />
        <div className="grid grid-cols-2 gap-3">
          <TextField
            name="height"
            label={copy.height}
            suffix={t.progress.measurements.units[heightUnit]}
            inputMode="decimal"
            autoComplete="off"
            defaultValue={shown(initial.heightCm, heightUnit)}
            error={errors.height}
          />
          <TextField
            name="weight"
            label={copy.weight}
            suffix={t.progress.measurements.units[weightUnit]}
            inputMode="decimal"
            autoComplete="off"
            defaultValue={shown(latestWeightKg, weightUnit)}
            hint={
              latestWeightKg === null
                ? undefined
                : interpolate(copy.weightHint, { value: formatMeasurement(locale, "weight", latestWeightKg, t.progress.measurements.units) })
            }
            error={errors.weight}
          />
        </div>
        <ChoiceList
          label={copy.activity}
          choices={ACTIVITY_LEVELS.map((value) => ({ value, title: copy.activities[value], subtitle: copy.activityHints[value] }))}
          value={activity}
          onChange={setActivity}
        />
        <Button type="submit" size="lg" block loading={pending}>
          {copy.submit}
        </Button>
      </form>

      {result ? (
        result.value.status === "ok" ? (
          <TargetCard t={t} locale={locale} macros={result.value} heading={copy.result}>
            {trainerName !== null ? (
              <p className="mt-2 text-footnote text-ink-2">{interpolate(copy.trainerActive, { name: trainerName })}</p>
            ) : null}
            <Button className="mt-3" block loading={saving} onClick={() => save(result.weightKg)}>
              {copy.save}
            </Button>
          </TargetCard>
        ) : (
          <p role="status" className="rounded-lg bg-surface-1 p-4 text-callout text-ink-2">
            {result.value.status === "minor"
              ? copy.minor
              : interpolate(copy.tooLow, { min: formatValue(locale, minKcal(sex)) })}
          </p>
        )
      ) : null}
    </section>
  );
}
