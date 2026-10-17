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
import { clearPairTarget, setPairTarget } from "@/lib/nutrition/actions";
import {
  KCAL_MAX,
  KCAL_MIN,
  STEPS_MAX,
  WATER_ML_MAX,
  gramsOfPercent,
  kcalOfMacros,
  macrosDisagree,
  minKcal,
  percentOfGrams,
  type ActivityGoals,
  type CalcSex,
  type Macro,
  type Macros,
} from "@/lib/nutrition/target";
import { formatValue } from "@/lib/progress/measurements";

type Field = "kcal" | Macro | "water" | "steps";
type Unit = "g" | "pct";
const MACROS = ["protein", "fat", "carbs"] as const satisfies readonly Macro[];
const GRAMS_MAX: Record<Macro, number> = { protein: 1000, fat: 1000, carbs: 2000 };
const gramsOf = (macros: Macros | null, macro: Macro) => macros?.[`${macro}G`] ?? null;

const whole = (text: string, max: number): number | null | "invalid" => {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (!/^\d{1,6}$/.test(trimmed)) return "invalid";
  const value = Number(trimmed);
  return value <= max ? value : "invalid";
};

/**
 * "Задать норму" / "Изменить норму" on the client's "Питание" tab (wave-2 §2.11–2.12): kcal, optional macros in
 * grams or in % of the kcal with a note when they disagree with the kcal by more than 5%, and a confirmation under
 * 1200/1500 kcal. Shares are saved as the grams they give. Water and steps goals a day are optional too (§4 rules 5
 * and 7): empty keeps 30 ml per kg of weight and 8000 steps.
 */
export function TrainerTargetForm({
  coachingId,
  current,
  goals,
  sex,
}: {
  coachingId: string;
  current: Macros | null;
  goals: ActivityGoals | null;
  sex: CalcSex | null;
}) {
  const { t, locale } = useI18n();
  const copy = t.nutrition.trainer;
  const [open, setOpen] = useState(false);
  const [low, setLow] = useState<Omit<Parameters<typeof setPairTarget>[0], "confirmLow"> | null>(null);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [draft, setDraft] = useState<Macros | null>(current);
  const [unit, setUnit] = useState<Unit>("g");
  /** What the macro fields start from: refilled when the unit switches, so the numbers carry over. */
  const [seed, setSeed] = useState<Record<Macro, number | null> | null>(null);
  const form = useRef<HTMLFormElement>(null);
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

  /** The macro fields as grams: typed grams, or the grams the typed shares give for this kcal. */
  function gramsFrom(formData: FormData, kcal: number | null, inUnit: Unit) {
    const typed = Object.fromEntries(
      MACROS.map((macro) => [macro, whole(String(formData.get(macro) ?? ""), inUnit === "pct" ? 100 : GRAMS_MAX[macro])]),
    ) as Record<Macro, number | null | "invalid">;
    const grams = (macro: Macro) => {
      const value = typed[macro];
      if (typeof value !== "number") return null;
      return inUnit === "g" ? value : kcal ? gramsOfPercent(kcal, macro, value) : null;
    };
    return { typed, proteinG: grams("protein"), fatG: grams("fat"), carbsG: grams("carbs") };
  }

  function read(formData: FormData) {
    const kcal = whole(String(formData.get("kcal") ?? ""), KCAL_MAX);
    const { typed, ...macros } = gramsFrom(formData, typeof kcal === "number" ? kcal : null, unit);
    const waterMl = whole(String(formData.get("water") ?? ""), WATER_ML_MAX);
    const steps = whole(String(formData.get("steps") ?? ""), STEPS_MAX);
    const next: Partial<Record<Field, string>> = {};
    if (typeof kcal !== "number" || kcal < KCAL_MIN) next.kcal = copy.errors.kcal;
    for (const macro of MACROS) if (typed[macro] === "invalid") next[macro] = unit === "pct" ? copy.errors.percent : copy.errors.grams;
    const shares = MACROS.reduce((sum, macro) => sum + (typeof typed[macro] === "number" ? typed[macro] : 0), 0);
    if (unit === "pct" && !next.protein && !next.fat && !next.carbs && shares > 100) next.carbs = copy.errors.percentSum;
    if (waterMl === "invalid") next.water = copy.activity.errors.water;
    if (steps === "invalid") next.steps = copy.activity.errors.steps;
    setErrors(next);
    if (Object.keys(next).length || typeof kcal !== "number" || waterMl === "invalid" || steps === "invalid") return null;
    return { kcal, ...macros, waterMl, steps };
  }

  /** Switches the macro fields between grams and %, carrying the typed numbers over at the current kcal. */
  function switchUnit(next: Unit) {
    const formData = form.current ? new FormData(form.current) : null;
    if (formData) {
      const kcal = whole(String(formData.get("kcal") ?? ""), KCAL_MAX);
      const known = typeof kcal === "number" && kcal > 0 ? kcal : null;
      const { typed, ...grams } = gramsFrom(formData, known, unit);
      setSeed(
        Object.fromEntries(
          MACROS.map((macro) => {
            const value = grams[`${macro}G`];
            if (next === unit) return [macro, typeof typed[macro] === "number" ? typed[macro] : null];
            if (next === "g") return [macro, value];
            return [macro, value !== null && known !== null ? percentOfGrams(known, macro, value) : null];
          }),
        ) as Record<Macro, number | null>,
      );
    }
    setErrors((errors) => ({ kcal: errors.kcal, water: errors.water, steps: errors.steps }));
    setUnit(next);
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
  const field = (name: Field, label: string, suffix: string, value: number | null | undefined, hint?: string) => (
    <TextField
      key={`${name}-${name === "kcal" || name === "water" || name === "steps" ? "" : unit}`}
      name={name}
      label={label}
      suffix={suffix}
      inputMode="numeric"
      autoComplete="off"
      defaultValue={value == null ? undefined : String(value)}
      hint={hint}
      error={errors[name]}
    />
  );
  const macroField = (macro: Macro) => {
    const grams = gramsOf(draft, macro);
    return field(
      macro,
      copy[macro],
      unit === "pct" ? "%" : copy.units.g,
      seed ? seed[macro] : gramsOf(current, macro),
      unit === "pct" && grams !== null ? interpolate(copy.gramsHint, { value: formatValue(locale, grams) }) : undefined,
    );
  };

  return (
    <>
      <Button
        icon={current ? Pencil : Plus}
        variant={current ? "secondary" : "primary"}
        onClick={() => {
          setErrors({});
          setDraft(current);
          setUnit("g");
          setSeed(null);
          setOpen(true);
        }}
      >
        {current ? copy.edit : copy.set}
      </Button>
      <Sheet open={open} onOpenChange={(next) => !pending && setOpen(next)} title={copy.formTitle} description={copy.formText}>
        <form
          ref={form}
          onSubmit={(event) => {
            event.preventDefault();
            submit(new FormData(event.currentTarget));
          }}
          noValidate
          className="flex flex-col gap-4"
          onChange={(event) => {
            const formData = new FormData(event.currentTarget);
            const kcal = whole(String(formData.get("kcal") ?? ""), KCAL_MAX);
            const known = typeof kcal === "number" ? kcal : 0;
            const { proteinG, fatG, carbsG } = gramsFrom(formData, known, unit);
            setDraft({ kcal: known, proteinG, fatG, carbsG });
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
          {mismatch !== null ? (
            <p role="status" className="px-1 text-footnote text-ink-2">
              {interpolate(copy.mismatch, { kcal: formatValue(locale, mismatch) })}
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            {field("water", copy.activity.water, copy.activity.ml, goals?.waterMl, copy.activity.waterHint)}
            {field("steps", copy.activity.steps, copy.activity.stepsUnit, goals?.steps, copy.activity.stepsHint)}
          </div>
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
