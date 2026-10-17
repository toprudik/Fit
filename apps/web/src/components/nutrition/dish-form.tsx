"use client";

import { Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { ListGroup, ListRow } from "@/components/ui/list";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/sonner";
import { Spinner } from "@/components/ui/spinner";
import { TextField } from "@/components/ui/text-field";
import { useI18n } from "@/i18n/client";
import { interpolate } from "@/i18n/format";
import { ENTRY_GRAMS_MAX, amountOf, parseAmount } from "@/lib/nutrition/diary";
import { findFoods, saveDish } from "@/lib/nutrition/diary-actions";
import type { Food } from "@/lib/nutrition/foods";
import { formatValue } from "@/lib/progress/measurements";
import { foodSubtitle } from "./food-subtitle";

type Item = { key: number; food: Food; grams: string };
const SEARCH_DELAY_MS = 400;

/** "Новое блюдо" (wave-2 §3.2, §3.5): products with grams; kcal per 100 g follow from the sum and the cooked weight. */
export function DishForm({ own, doneHref }: { own: Food[]; doneHref: string }) {
  const { t, locale } = useI18n();
  const copy = t.foodDiary.dish;
  const units = t.nutrition.trainer.units;
  const router = useRouter();
  const [name, setName] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [total, setTotal] = useState("");
  const [picking, setPicking] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; items?: string; total?: string; grams?: Record<number, string> }>({});
  const [pending, startTransition] = useTransition();
  const nextKey = useRef(0);
  const n = (value: number) => formatValue(locale, value);

  const parsed = items.map((item) => parseAmount(item.grams, 0.1, ENTRY_GRAMS_MAX));
  const sums = items.reduce(
    (acc, item, index) => {
      const grams = parsed[index];
      if (typeof grams !== "number") return acc;
      const part = amountOf(item.food, grams);
      return { grams: acc.grams + grams, kcal: acc.kcal + part.kcal, protein: acc.protein + part.proteinG, fat: acc.fat + part.fatG, carbs: acc.carbs + part.carbsG };
    },
    { grams: 0, kcal: 0, protein: 0, fat: 0, carbs: 0 },
  );
  const totalG = parseAmount(total, 1, 50000);
  const weight = typeof totalG === "number" ? totalG : sums.grams;
  const per100 = (value: number) => n(Math.round((value * 1000) / weight) / 10);

  function pick(food: Food) {
    setItems((current) => [...current, { key: nextKey.current++, food, grams: "100" }]);
    setPicking(false);
  }

  function save() {
    const next: typeof errors = {};
    if (!name.trim()) next.name = copy.errors.name;
    if (!items.length) next.items = copy.itemsEmpty;
    const grams: Record<number, string> = {};
    items.forEach((item, index) => {
      if (typeof parsed[index] !== "number") grams[item.key] = t.foodDiary.errors.grams;
    });
    if (Object.keys(grams).length) next.grams = grams;
    if (totalG === "invalid") next.total = copy.errors.total;
    setErrors(next);
    if (Object.keys(next).length) return;
    startTransition(async () => {
      const result = await saveDish({
        name: name.slice(0, 200),
        items: items.map((item, index) => ({ foodId: item.food.id, grams: parsed[index] as number })),
        totalG: typeof totalG === "number" ? totalG : null,
      });
      if (result.ok) {
        toast.success(copy.saved);
        router.push(doneHref);
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
        save();
      }}
    >
      <p className="px-1 text-callout text-ink-2">{copy.text}</p>
      <TextField label={copy.name} value={name} onChange={(event) => setName(event.target.value)} autoComplete="off" maxLength={200} error={errors.name} />
      <fieldset className="flex flex-col gap-3">
        <legend className="px-1 pb-1.5 text-footnote text-ink-2">{copy.items}</legend>
        {items.map((item) => (
          <div key={item.key} className="flex items-end gap-2">
            <TextField
              className="flex-1"
              label={item.food.name}
              suffix={units.g}
              inputMode="decimal"
              autoComplete="off"
              value={item.grams}
              onChange={(event) => setItems((current) => current.map((other) => (other.key === item.key ? { ...other, grams: event.target.value } : other)))}
              error={errors.grams?.[item.key]}
            />
            <IconButton
              icon={X}
              label={interpolate(copy.remove, { name: item.food.name })}
              onClick={() => setItems((current) => current.filter((other) => other.key !== item.key))}
              className="mb-1"
            />
          </div>
        ))}
        {errors.items ? <p className="px-1 text-footnote text-danger">{errors.items}</p> : null}
        <Button type="button" variant="secondary" icon={Plus} onClick={() => setPicking(true)} className="self-start">
          {copy.addItem}
        </Button>
      </fieldset>
      <TextField
        label={copy.totalG}
        hint={copy.totalHint}
        suffix={units.g}
        inputMode="decimal"
        autoComplete="off"
        value={total}
        onChange={(event) => setTotal(event.target.value)}
        error={errors.total}
      />
      {sums.grams > 0 && weight > 0 ? (
        <div className="flex flex-col gap-1 rounded-lg bg-surface-1 p-4 text-callout tabular-nums" aria-live="polite">
          <p>{interpolate(copy.per100, { kcal: per100(sums.kcal), protein: per100(sums.protein), fat: per100(sums.fat), carbs: per100(sums.carbs) })}</p>
          <p className="text-ink-2">{interpolate(copy.whole, { kcal: n(Math.round(sums.kcal)), grams: n(weight) })}</p>
        </div>
      ) : null}
      <Button type="submit" size="lg" block loading={pending}>
        {copy.save}
      </Button>
      {picking ? <PickSheet own={own} onPick={pick} onClose={() => setPicking(false)} /> : null}
    </form>
  );
}

function PickSheet({ own, onPick, onClose }: { own: Food[]; onPick: (food: Food) => void; onClose: () => void }) {
  const { t, locale } = useI18n();
  const copy = t.foodDiary.addScreen;
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<{ query: string; foods: Food[] } | null>(null);
  const [pending, startTransition] = useTransition();
  const latest = useRef("");

  useEffect(() => {
    const q = query.trim();
    latest.current = q;
    if (q.length < 2) return;
    const timer = setTimeout(() => {
      startTransition(async () => {
        const found = await findFoods(q).catch(() => ({ foods: [] as Food[], catalogDown: true }));
        if (latest.current === q) setResult({ query: q, foods: found.foods });
      });
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const q = query.trim();
  const products = (foods: Food[]) => foods.filter((food) => food.kind === "product");
  const shown = q.length >= 2 && result?.query === q ? products(result.foods) : null;
  const rows = (foods: Food[]) =>
    foods.map((food) => <ListRow key={food.id} title={food.name} subtitle={foodSubtitle(t, locale, food)} onClick={() => onPick(food)} chevron />);

  return (
    <Sheet open onOpenChange={(next) => !next && onClose()} title={t.foodDiary.dish.pickTitle}>
      <div className="flex flex-col gap-4">
        <TextField
          type="search"
          label={copy.searchLabel}
          hint={copy.searchHint}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          autoComplete="off"
          enterKeyHint="search"
          maxLength={100}
        />
        {pending ? (
          <p role="status" className="flex items-center gap-2 px-1 text-footnote text-ink-2">
            <Spinner className="size-4" /> {copy.searching}
          </p>
        ) : null}
        {shown ? (
          shown.length ? (
            <ListGroup>{rows(shown)}</ListGroup>
          ) : !pending ? (
            <p className="px-1 text-callout text-ink-2">{copy.nothingFound}</p>
          ) : null
        ) : products(own).length ? (
          <ListGroup header={copy.own}>{rows(products(own))}</ListGroup>
        ) : null}
        <p className="px-1 text-caption-1 text-ink-3">{copy.attribution}</p>
      </div>
    </Sheet>
  );
}
