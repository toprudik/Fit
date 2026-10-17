"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { TextField } from "@/components/ui/text-field";
import { useI18n } from "@/i18n/client";
import { ENTRY_GRAMS_MAX, FOOD_KCAL_100_MAX, parseAmount } from "@/lib/nutrition/diary";
import { archiveFood, saveFood } from "@/lib/nutrition/diary-actions";
import type { Food } from "@/lib/nutrition/foods";
import { normalizeBarcode } from "@/lib/nutrition/off-parse";
import { OWN_FOODS_PATH } from "./paths";

type Field = "name" | "kcal" | "protein" | "fat" | "carbs" | "barcode" | "servingG";

const text = (value: number | null | undefined) => (value === null || value === undefined ? "" : String(value).replace(".", ","));

/**
 * An own product with values per 100 g (wave-2 §3.2, §3.10). `doneHref` is where it returns after saving:
 * back to "+ Еда" when the product was created from a barcode that the catalog did not know. `draft` prefills a
 * catalog product that has no kcal there: it is added only once the client types them (wave-2 §3.8).
 */
export function ProductForm({
  food,
  barcode,
  doneHref,
  draft = null,
}: {
  food: Food | null;
  barcode: string;
  doneHref: string;
  draft?: { name: string; brand: string } | null;
}) {
  const { t } = useI18n();
  const copy = t.foodDiary.product;
  const units = t.nutrition.trainer.units;
  const router = useRouter();
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [pending, startTransition] = useTransition();

  function submit(form: FormData) {
    const field = (name: string) => String(form.get(name) ?? "");
    const kcal = parseAmount(field("kcal"), 0, FOOD_KCAL_100_MAX);
    const macro = (name: string) => parseAmount(field(name), 0, 100);
    const protein = macro("protein");
    const fat = macro("fat");
    const carbs = macro("carbs");
    const servingG = parseAmount(field("servingG"), 1, ENTRY_GRAMS_MAX);
    const code = field("barcode").trim();
    const next: typeof errors = {};
    if (!field("name").trim()) next.name = copy.errors.name;
    if (typeof kcal !== "number") next.kcal = copy.errors.kcal;
    if (protein === "invalid") next.protein = copy.errors.macro;
    if (fat === "invalid") next.fat = copy.errors.macro;
    if (carbs === "invalid") next.carbs = copy.errors.macro;
    const sum = [protein, fat, carbs].reduce<number>((total, value) => total + (typeof value === "number" ? value : 0), 0);
    if (!next.protein && !next.fat && !next.carbs && sum > 100) next.carbs = copy.errors.macros;
    if (servingG === "invalid") next.servingG = copy.errors.serving;
    if (code && !normalizeBarcode(code)) next.barcode = copy.errors.barcode;
    setErrors(next);
    if (Object.keys(next).length || typeof kcal !== "number") return;
    const grams = (value: number | null | "invalid") => (typeof value === "number" ? value : null);
    startTransition(async () => {
      const result = await saveFood({
        id: food?.id ?? null,
        name: field("name").slice(0, 200),
        brand: field("brand").slice(0, 200),
        barcode: code,
        kcal100: kcal,
        protein100: grams(protein),
        fat100: grams(fat),
        carbs100: grams(carbs),
        servingG: grams(servingG),
        servingLabel: field("servingLabel").slice(0, 80),
      });
      if (result.ok) {
        toast.success(copy.saved);
        router.push(doneHref);
      } else if (result.reason === "taken") {
        setErrors({ barcode: copy.errors.taken });
      } else {
        toast.error(t.foodDiary.failed);
      }
    });
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit(new FormData(event.currentTarget));
      }}
    >
      <p className="px-1 text-callout text-ink-2">{draft ? copy.draftText : copy.text}</p>
      <TextField name="name" label={copy.name} defaultValue={food?.name ?? draft?.name ?? ""} autoComplete="off" maxLength={200} error={errors.name} />
      <TextField
        name="brand"
        label={copy.brand}
        hint={copy.optional}
        defaultValue={food?.brand ?? draft?.brand ?? ""}
        autoComplete="off"
        maxLength={200}
      />
      <TextField
        name="kcal"
        label={copy.kcal}
        suffix={units.kcal}
        inputMode="decimal"
        autoComplete="off"
        defaultValue={text(food?.kcal100)}
        error={errors.kcal}
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {(["protein", "fat", "carbs"] as const).map((name) => (
          <TextField
            key={name}
            name={name}
            label={copy[name]}
            suffix={units.g}
            inputMode="decimal"
            autoComplete="off"
            defaultValue={text(food?.[`${name}100`])}
            error={errors[name]}
          />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TextField
          name="servingG"
          label={copy.servingG}
          hint={copy.optional}
          suffix={units.g}
          inputMode="decimal"
          autoComplete="off"
          defaultValue={text(food?.servingG)}
          error={errors.servingG}
        />
        <TextField
          name="servingLabel"
          label={copy.servingLabel}
          hint={copy.servingLabelHint}
          defaultValue={food?.servingLabel ?? ""}
          autoComplete="off"
          maxLength={80}
        />
      </div>
      <TextField
        name="barcode"
        label={copy.barcode}
        hint={copy.optional}
        inputMode="numeric"
        autoComplete="off"
        maxLength={20}
        defaultValue={food?.barcode ?? barcode}
        error={errors.barcode}
      />
      <Button type="submit" size="lg" block loading={pending}>
        {copy.save}
      </Button>
      {food ? <ArchiveFoodButton id={food.id} /> : null}
    </form>
  );
}

/** Removes an own product or dish from the lists; entries already in the diary keep their values (§3.10). */
export function ArchiveFoodButton({ id }: { id: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function archive() {
    startTransition(async () => {
      const result = await archiveFood(id);
      if (result.ok) {
        toast.success(t.foodDiary.foods.archived);
        router.push(OWN_FOODS_PATH);
      } else {
        toast.error(t.foodDiary.failed);
      }
    });
  }

  return (
    <Button type="button" variant="ghost" icon={Trash2} onClick={archive} loading={pending} className="self-start text-danger">
      {t.foodDiary.foods.archive}
    </Button>
  );
}
