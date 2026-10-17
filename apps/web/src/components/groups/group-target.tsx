"use client";

import { Pencil, Plus } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/sonner";
import { TextField } from "@/components/ui/text-field";
import { useI18n } from "@/i18n/client";
import { interpolate } from "@/i18n/format";
import { clearGroupTarget, setGroupTarget, type TemplateInput } from "@/lib/groups/actions";
import type { Template } from "@/lib/groups/load";
import { KCAL_MAX, KCAL_MIN, gramsOfPercent, minKcal, percentOfGrams, type Macro } from "@/lib/nutrition/target";
import { formatValue } from "@/lib/progress/measurements";

type Field = "kcal" | Macro | "water" | "steps";
type Unit = "g" | "pct";
const MACROS = ["protein", "fat", "carbs"] as const satisfies readonly Macro[];
const LIMITS: Record<Field, number> = { kcal: KCAL_MAX, protein: 1000, fat: 1000, carbs: 2000, water: 10000, steps: 100000 };
const gramsKey = { protein: "proteinG", fat: "fatG", carbs: "carbsG" } as const satisfies Record<Macro, keyof Template>;

const whole = (text: string, max: number): number | null | "invalid" => {
  const trimmed = text.replace(/\s/g, "");
  if (!trimmed) return null;
  if (!/^\d{1,6}$/.test(trimmed)) return "invalid";
  const value = Number(trimmed);
  return value <= max ? value : "invalid";
};

/**
 * "Шаблон нормы" of a group (PRD wave-2 §6 rules 2 and 6): kcal with optional macros in grams or in % of the kcal
 * (§2.11), water and steps. The sheet says how many clients get the new target from today before saving; under
 * 1200 kcal it asks once more. Shares are saved as the grams they give.
 */
export function GroupTargetForm({ groupId, current, impact }: { groupId: string; current: Template | null; impact: number }) {
  const { t, locale } = useI18n();
  const copy = t.trainerGroups.template;
  const [open, setOpen] = useState(false);
  const [low, setLow] = useState<Omit<TemplateInput, "confirmLow"> | null>(null);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [unit, setUnit] = useState<Unit>("g");
  /** What the macro fields start from: refilled when the unit switches, so the numbers carry over. */
  const [seed, setSeed] = useState<Record<Macro, number | null> | null>(null);
  /** Grams the typed shares give, shown under each field while in %. */
  const [grams, setGrams] = useState<Record<Macro, number | null> | null>(null);
  const form = useRef<HTMLFormElement>(null);
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

  /** The form's numbers; macros read in the given unit and turned into grams at the typed kcal. */
  function read(formData: FormData, inUnit: Unit) {
    const values = Object.fromEntries(
      (Object.keys(LIMITS) as Field[]).map((field) => [
        field,
        whole(String(formData.get(field) ?? ""), inUnit === "pct" && field in gramsKey ? 100 : LIMITS[field]),
      ]),
    ) as Record<Field, number | null | "invalid">;
    const kcal = typeof values.kcal === "number" && values.kcal > 0 ? values.kcal : null;
    const macroGrams = Object.fromEntries(
      MACROS.map((macro) => {
        const value = values[macro];
        if (typeof value !== "number") return [macro, null];
        return [macro, inUnit === "g" ? value : kcal ? gramsOfPercent(kcal, macro, value) : null];
      }),
    ) as Record<Macro, number | null>;
    return { values, kcal, macroGrams };
  }

  /** Switches the macro fields between grams and %, carrying the typed numbers over at the current kcal. */
  function switchUnit(next: Unit) {
    if (form.current) {
      const { values, kcal, macroGrams } = read(new FormData(form.current), unit);
      setSeed(
        Object.fromEntries(
          MACROS.map((macro) => {
            const typed = values[macro];
            if (next === unit) return [macro, typeof typed === "number" ? typed : null];
            if (next === "g") return [macro, macroGrams[macro]];
            const value = macroGrams[macro];
            return [macro, value !== null && kcal !== null ? percentOfGrams(kcal, macro, value) : null];
          }),
        ) as Record<Macro, number | null>,
      );
      setGrams(next === "pct" ? macroGrams : null);
    }
    setErrors((errors) => ({ kcal: errors.kcal, water: errors.water, steps: errors.steps }));
    setUnit(next);
  }

  function submit(formData: FormData) {
    const { values, macroGrams } = read(formData, unit);
    const next: Partial<Record<Field, string>> = {};
    if (typeof values.kcal !== "number" || values.kcal < KCAL_MIN) next.kcal = copy.errors.kcal;
    for (const field of ["water", "steps"] as const) if (values[field] === "invalid") next[field] = copy.errors.number;
    for (const macro of MACROS) if (values[macro] === "invalid") next[macro] = unit === "pct" ? copy.errors.percent : copy.errors.number;
    const shares = MACROS.reduce((sum, macro) => sum + (typeof values[macro] === "number" ? (values[macro] as number) : 0), 0);
    if (unit === "pct" && MACROS.every((macro) => !next[macro]) && shares > 100) next.carbs = copy.errors.percentSum;
    setErrors(next);
    if (Object.keys(next).length || typeof values.kcal !== "number") return;
    const value = (field: Field) => (typeof values[field] === "number" ? (values[field] as number) : null);
    const input = {
      groupId,
      kcal: values.kcal,
      proteinG: macroGrams.protein,
      fatG: macroGrams.fat,
      carbsG: macroGrams.carbs,
      waterMl: value("water"),
      steps: value("steps"),
    };
    if (values.kcal < minKcal(null)) {
      setLow(input);
      return;
    }
    send(input, false);
  }

  const field = (name: Field, label: string, suffix: string, initial: number | null | undefined, hint?: string) => (
    <TextField
      key={name in gramsKey ? `${name}-${unit}` : name}
      name={name}
      label={label}
      suffix={suffix}
      inputMode="numeric"
      autoComplete="off"
      defaultValue={initial == null ? undefined : String(initial)}
      hint={hint}
      error={errors[name]}
    />
  );
  const macroField = (macro: Macro) => {
    const inGrams = grams?.[macro] ?? null;
    return field(
      macro,
      copy[macro],
      unit === "pct" ? "%" : copy.units.g,
      seed ? seed[macro] : current?.[gramsKey[macro]],
      unit === "pct" && inGrams !== null ? interpolate(copy.gramsHint, { value: formatValue(locale, inGrams) }) : undefined,
    );
  };

  return (
    <>
      <Button
        icon={current ? Pencil : Plus}
        variant={current ? "secondary" : "primary"}
        onClick={() => {
          setErrors({});
          setUnit("g");
          setSeed(null);
          setGrams(null);
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
          ref={form}
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit(new FormData(event.currentTarget));
          }}
          onChange={(event) => {
            if (unit === "pct") setGrams(read(new FormData(event.currentTarget), unit).macroGrams);
          }}
        >
          {field("kcal", copy.kcal, copy.units.kcal, current?.kcal)}
          <SegmentedControl
            label={copy.macrosIn}
            value={unit}
            onValueChange={switchUnit}
            options={[
              { value: "g", label: copy.inGrams },
              { value: "pct", label: copy.inPercent },
            ]}
          />
          <div className="grid grid-cols-3 gap-3">{MACROS.map(macroField)}</div>
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
