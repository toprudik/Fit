"use client";

import { Copy, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ChipRadio } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { ListGroup, ListRow } from "@/components/ui/list";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/sonner";
import { TextField } from "@/components/ui/text-field";
import { useI18n } from "@/i18n/client";
import { interpolate } from "@/i18n/format";
import type { Dictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";
import {
  ENTRY_KCAL_MAX,
  MEALS,
  SERVINGS_MAX,
  byMeal,
  gramsOfPortion,
  parseAmount,
  portionOfGrams,
  portionRange,
  portionUnit,
  totalsOf,
  type DiaryEntry,
  type Meal,
} from "@/lib/nutrition/diary";
import { copyPreviousMeal, deleteEntry, updateEntry } from "@/lib/nutrition/diary-actions";
import { formatValue } from "@/lib/progress/measurements";
import { ADD_FOOD_PATH } from "./paths";

/** "150 г" (ounces in English) or "2 × порция", for a row under the entry's name. */
export function entryAmount(t: Dictionary, locale: Locale, entry: DiaryEntry): string | null {
  const copy = t.foodDiary;
  if (entry.servings !== null) return interpolate(copy.servings, { count: formatValue(locale, entry.servings), label: copy.servingDefault });
  if (entry.grams === null) return null;
  const unit = portionUnit(locale);
  return interpolate(unit === "oz" ? copy.ounces : copy.grams, { value: formatValue(locale, portionOfGrams(entry.grams, unit)) });
}

/** The meals of a day; read-only for the trainer. */
export function MealGroups({
  entries,
  onOpen,
  footer,
}: {
  entries: DiaryEntry[];
  onOpen?: (entry: DiaryEntry) => void;
  footer?: (meal: Meal, count: number) => React.ReactNode;
}) {
  const { t, locale } = useI18n();
  const copy = t.foodDiary;
  return (
    <>
      {byMeal(entries).map(({ meal, entries: rows }) => {
        const kcal = totalsOf(rows).kcal;
        return (
          <ListGroup
            key={meal}
            header={rows.length ? `${copy.meals[meal]}, ${interpolate(copy.mealKcal, { value: formatValue(locale, Math.round(kcal)) })}` : copy.meals[meal]}
            footer={footer?.(meal, rows.length)}
          >
            {rows.map((entry) => (
              <ListRow
                key={entry.id}
                title={entry.title ?? copy.quickTitle}
                subtitle={entryAmount(t, locale, entry) ?? undefined}
                value={interpolate(copy.mealKcal, { value: formatValue(locale, Math.round(entry.kcal)) })}
                onClick={onOpen ? () => onOpen(entry) : undefined}
              />
            ))}
          </ListGroup>
        );
      })}
    </>
  );
}

/** The client's meals of a day with "Добавить" and "Как вчера" per meal, and an entry to change or delete. */
export function MealList({ day, entries, previousMeals }: { day: string; entries: DiaryEntry[]; previousMeals: Meal[] }) {
  const { t } = useI18n();
  const copy = t.foodDiary;
  const [open, setOpen] = useState<DiaryEntry | null>(null);
  const [pending, startTransition] = useTransition();

  function copyMeal(meal: Meal) {
    startTransition(async () => {
      const result = await copyPreviousMeal(day, meal);
      if (result.ok) toast.success(copy.copied);
      else toast.error(copy.failed);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {entries.length === 0 ? <EmptyState icon={Plus} title={copy.empty} description={copy.emptyText} headingLevel={3} /> : null}
      <MealGroups
        entries={entries}
        onOpen={setOpen}
        footer={(meal, count) => (
          <div className="flex flex-wrap gap-2 pt-2">
            <Button asChild size="sm" variant="secondary" icon={Plus}>
              <Link href={`${ADD_FOOD_PATH}?day=${day}&meal=${meal}`} aria-label={interpolate(copy.addTo, { meal: copy.meals[meal] })}>
                {copy.add}
              </Link>
            </Button>
            {count === 0 && previousMeals.includes(meal) ? (
              <Button size="sm" variant="ghost" icon={Copy} loading={pending} onClick={() => copyMeal(meal)}>
                {copy.copyPrevious}
              </Button>
            ) : null}
          </div>
        )}
      />
      {open ? <EntrySheet entry={open} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}

/** "Запись": the meal and the amount, or the kcal of a quick entry; delete. */
function EntrySheet({ entry, onClose }: { entry: DiaryEntry; onClose: () => void }) {
  const { t, locale } = useI18n();
  const unit = portionUnit(locale);
  const copy = t.foodDiary;
  const [meal, setMeal] = useState<Meal>(entry.meal);
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  const quick = entry.grams === null;
  const byServings = !quick && entry.servings !== null;

  function save(formData: FormData) {
    const text = String(formData.get("amount") ?? "");
    const value = quick
      ? parseAmount(text, 1, ENTRY_KCAL_MAX)
      : byServings
        ? parseAmount(text, 0.01, SERVINGS_MAX)
        : parseAmount(text, ...portionRange(unit));
    if (typeof value !== "number") {
      setError(quick ? copy.errors.kcal : byServings ? copy.errors.servings : unit === "oz" ? copy.errors.ounces : copy.errors.grams);
      return;
    }
    setError(undefined);
    startTransition(async () => {
      const result = await updateEntry({
        id: entry.id,
        meal,
        ...(quick ? { kcal: value } : byServings ? { servings: value } : { grams: gramsOfPortion(value, unit) }),
      });
      if (!result.ok) {
        toast.error(copy.failed);
        return;
      }
      toast.success(copy.editor.saved);
      onClose();
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteEntry(entry.id);
      if (!result.ok) {
        toast.error(copy.failed);
        return;
      }
      toast.success(copy.editor.deleted);
      onClose();
    });
  }

  const current = quick ? entry.kcal : byServings ? entry.servings : entry.grams === null ? null : portionOfGrams(entry.grams, unit);
  return (
    <Sheet open onOpenChange={(next) => !next && !pending && onClose()} title={entry.title ?? copy.quickTitle}>
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          save(new FormData(event.currentTarget));
        }}
      >
        <fieldset className="flex flex-col gap-2">
          <legend className="px-1 pb-1.5 text-footnote text-ink-2">{copy.editor.meal}</legend>
          <div className="flex flex-wrap gap-2">
            {MEALS.map((option) => (
              <ChipRadio key={option} name="meal" value={option} checked={meal === option} onChange={() => setMeal(option)}>
                {copy.meals[option]}
              </ChipRadio>
            ))}
          </div>
        </fieldset>
        <TextField
          name="amount"
          label={quick ? copy.editor.kcal : byServings ? copy.editor.servings : unit === "oz" ? copy.editor.ounces : copy.editor.grams}
          suffix={quick ? t.nutrition.trainer.units.kcal : byServings ? undefined : t.nutrition.trainer.units[unit]}
          inputMode="decimal"
          autoComplete="off"
          defaultValue={current === null ? undefined : String(current).replace(".", locale === "ru" ? "," : ".")}
          error={error}
        />
        <Button type="submit" size="lg" block loading={pending}>
          {copy.editor.save}
        </Button>
        <Button type="button" variant="destructive" size="lg" block icon={Trash2} disabled={pending} onClick={remove}>
          {copy.editor.delete}
        </Button>
      </form>
    </Sheet>
  );
}
