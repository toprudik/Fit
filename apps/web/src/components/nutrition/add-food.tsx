"use client";

import { Heart, HeartOff, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ChipRadio } from "@/components/ui/chip";
import { ListGroup, ListRow } from "@/components/ui/list";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/sonner";
import { Spinner } from "@/components/ui/spinner";
import { TextField } from "@/components/ui/text-field";
import { useI18n } from "@/i18n/client";
import { interpolate } from "@/i18n/format";
import {
  ENTRY_KCAL_MAX,
  MEALS,
  SERVINGS_MAX,
  amountOf,
  gramsOfPortion,
  parseAmount,
  portionOfGrams,
  portionRange,
  portionUnit,
  type Meal,
} from "@/lib/nutrition/diary";
import { addEntry, findBarcode, findFoods, setFavorite } from "@/lib/nutrition/diary-actions";
import type { Food } from "@/lib/nutrition/foods";
import type { OffDraft } from "@/lib/nutrition/off-parse";
import type { FoodShelf } from "@/lib/nutrition/diary-load";
import { formatValue } from "@/lib/progress/measurements";
import { BarcodeScanner } from "./barcode-scanner";
import { foodSubtitle } from "./food-subtitle";
import { FOOD_PATH, OWN_FOODS_PATH } from "./paths";

type Tab = "search" | "barcode" | "quick" | "mine";
const SEARCH_DELAY_MS = 400;

function FoodRows({ foods, onPick }: { foods: Food[]; onPick: (food: Food) => void }) {
  const { t, locale } = useI18n();
  return foods.map((food) => (
    <ListRow key={food.id} title={food.name} subtitle={foodSubtitle(t, locale, food)} onClick={() => onPick(food)} chevron />
  ));
}

/** An own product prefilled from a catalog product that has no kcal there, back to the same day and meal (§3.8). */
function draftHref(draft: OffDraft, day: string, meal: Meal) {
  const params = new URLSearchParams({ barcode: draft.code, name: draft.name, ...(draft.brand ? { brand: draft.brand } : {}), day, meal });
  return `${OWN_FOODS_PATH}/new?${params}`;
}

/**
 * "+ Еда" (wave-2 §3.2): search Open Food Facts and own foods, a barcode, quick kcal or own foods, then the
 * amount. The meal comes from the diary and can be changed here.
 */
export function AddFood({ day, initialMeal, shelf }: { day: string; initialMeal: Meal; shelf: FoodShelf }) {
  const { t } = useI18n();
  const copy = t.foodDiary;
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("search");
  const [meal, setMeal] = useState<Meal>(initialMeal);
  const [picked, setPicked] = useState<Food | null>(null);
  const back = day ? `${FOOD_PATH}?day=${day}` : FOOD_PATH;

  function added() {
    // The screen stays mounted (Activity) for the next «Добавить»: it must open without this food's sheet.
    setPicked(null);
    toast.success(interpolate(copy.addScreen.added, { meal: copy.meals[meal] }));
    router.push(back);
  }

  return (
    <div className="flex flex-col gap-5">
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
      <SegmentedControl
        label={copy.addScreen.tabsLabel}
        value={tab}
        onValueChange={setTab}
        options={(["search", "barcode", "quick", "mine"] as const).map((value) => ({ value, label: copy.addScreen.tabs[value] }))}
      />
      {tab === "search" ? <SearchTab day={day} meal={meal} shelf={shelf} onPick={setPicked} /> : null}
      {tab === "barcode" ? <BarcodeTab day={day} meal={meal} onPick={setPicked} /> : null}
      {tab === "quick" ? <QuickTab day={day} meal={meal} onAdded={added} /> : null}
      {tab === "mine" ? <MineTab shelf={shelf} onPick={setPicked} /> : null}
      {picked ? (
        <AmountSheet
          food={picked}
          day={day}
          meal={meal}
          favorite={shelf.favoriteIds.includes(picked.id)}
          onClose={() => setPicked(null)}
          onAdded={added}
        />
      ) : null}
    </div>
  );
}

function SearchTab({ day, meal, shelf, onPick }: { day: string; meal: Meal; shelf: FoodShelf; onPick: (food: Food) => void }) {
  const { t, locale } = useI18n();
  const copy = t.foodDiary.addScreen;
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<{ query: string; foods: Food[]; drafts: OffDraft[]; catalogDown: boolean } | null>(null);
  const [pending, startTransition] = useTransition();
  const latest = useRef("");

  useEffect(() => {
    const q = query.trim();
    latest.current = q;
    if (q.length < 2) return;
    const timer = setTimeout(() => {
      startTransition(async () => {
        try {
          const found = await findFoods(q, locale);
          if (latest.current === q) setResult({ query: q, ...found });
        } catch {
          if (latest.current === q) setResult({ query: q, foods: [], drafts: [], catalogDown: true });
        }
      });
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [query, locale]);

  const q = query.trim();
  const shown = q.length >= 2 && result?.query === q ? result : null;
  return (
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
      {shown?.catalogDown ? <p className="rounded-md bg-surface-1 p-3 text-footnote text-ink-2">{copy.catalogDown}</p> : null}
      {shown ? (
        shown.foods.length || shown.drafts.length ? (
          <>
            {shown.foods.length ? (
              <ListGroup>
                <FoodRows foods={shown.foods} onPick={onPick} />
              </ListGroup>
            ) : null}
            {shown.drafts.length ? (
              <ListGroup header={copy.noFacts.header} footer={copy.noFacts.footer}>
                {shown.drafts.map((draft) => (
                  <ListRow
                    key={draft.code}
                    title={draft.name}
                    subtitle={draft.brand ? interpolate(copy.noFacts.brandRow, { brand: draft.brand }) : copy.noFacts.row}
                    href={draftHref(draft, day, meal)}
                  />
                ))}
              </ListGroup>
            ) : null}
          </>
        ) : !pending ? (
          <p className="px-1 text-callout text-ink-2">{copy.nothingFound}</p>
        ) : null
      ) : q.length < 2 ? (
        <>
          {shelf.favorites.length ? (
            <ListGroup header={copy.favorites}>
              <FoodRows foods={shelf.favorites} onPick={onPick} />
            </ListGroup>
          ) : null}
          {shelf.recent.length ? (
            <ListGroup header={copy.recent}>
              <FoodRows foods={shelf.recent} onPick={onPick} />
            </ListGroup>
          ) : null}
        </>
      ) : null}
      <p className="px-1 text-caption-1 text-ink-3">{copy.attribution}</p>
    </div>
  );
}

function BarcodeTab({ day, meal, onPick }: { day: string; meal: Meal; onPick: (food: Food) => void }) {
  const { t, locale } = useI18n();
  const copy = t.foodDiary.barcode;
  const [error, setError] = useState<string | undefined>();
  const [missing, setMissing] = useState<{ barcode: string; catalogDown: boolean; draft: OffDraft | null } | null>(null);
  const [pending, startTransition] = useTransition();

  function look(value: string) {
    setMissing(null);
    startTransition(async () => {
      const found = await findBarcode(value, locale).catch(() => null);
      if (!found) {
        toast.error(t.foodDiary.failed);
        return;
      }
      if (!found.barcode) {
        setError(copy.invalid);
        return;
      }
      setError(undefined);
      if (found.food) onPick(found.food);
      else setMissing({ barcode: found.barcode, catalogDown: found.catalogDown, draft: found.draft });
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <BarcodeScanner onDetected={look} />
      <form
        noValidate
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          look(String(new FormData(event.currentTarget).get("barcode") ?? ""));
        }}
      >
        <TextField name="barcode" label={copy.manualLabel} inputMode="numeric" autoComplete="off" maxLength={20} error={error} />
        <Button type="submit" variant="secondary" icon={Search} loading={pending} className="self-start">
          {copy.find}
        </Button>
      </form>
      {missing?.draft ? (
        <div className="flex flex-col items-start gap-3 rounded-lg bg-surface-1 p-4">
          <p className="text-callout">{interpolate(copy.noFacts, { name: missing.draft.name })}</p>
          <Button asChild icon={Plus}>
            <Link href={draftHref(missing.draft, day, meal)}>{copy.typeKcal}</Link>
          </Button>
        </div>
      ) : missing ? (
        <div className="flex flex-col items-start gap-3 rounded-lg bg-surface-1 p-4">
          <p className="text-callout">{missing.catalogDown ? copy.catalogDown : copy.notFound}</p>
          <Button asChild icon={Plus}>
            <Link href={`${OWN_FOODS_PATH}/new?barcode=${missing.barcode}&day=${day}&meal=${meal}`}>{copy.create}</Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function QuickTab({ day, meal, onAdded }: { day: string; meal: Meal; onAdded: () => void }) {
  const { t } = useI18n();
  const copy = t.foodDiary.quick;
  const units = t.nutrition.trainer.units;
  const [errors, setErrors] = useState<Partial<Record<"kcal" | "protein" | "fat" | "carbs", string>>>({});
  const [pending, startTransition] = useTransition();

  function submit(form: FormData) {
    const read = (name: string, min: number, max: number) => parseAmount(String(form.get(name) ?? ""), min, max);
    const values = { kcal: read("kcal", 1, ENTRY_KCAL_MAX), protein: read("protein", 0, 1000), fat: read("fat", 0, 1000), carbs: read("carbs", 0, 1000) };
    const next: typeof errors = {};
    if (typeof values.kcal !== "number") next.kcal = t.foodDiary.errors.kcal;
    for (const key of ["protein", "fat", "carbs"] as const) if (values[key] === "invalid") next[key] = t.foodDiary.errors.macro;
    setErrors(next);
    if (Object.keys(next).length || typeof values.kcal !== "number") return;
    const grams = (value: number | null | "invalid") => (typeof value === "number" ? value : null);
    const kcal = values.kcal;
    startTransition(async () => {
      const result = await addEntry({
        day,
        meal,
        kcal,
        proteinG: grams(values.protein),
        fatG: grams(values.fat),
        carbsG: grams(values.carbs),
        title: String(form.get("title") ?? "").slice(0, 200),
      });
      if (result.ok) onAdded();
      else toast.error(t.foodDiary.failed);
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
      <p className="px-1 text-callout text-ink-2">{copy.text}</p>
      <TextField name="kcal" label={copy.kcal} suffix={units.kcal} inputMode="decimal" autoComplete="off" error={errors.kcal} />
      <div className="grid grid-cols-3 gap-3">
        <TextField name="protein" label={copy.protein} suffix={units.g} inputMode="decimal" autoComplete="off" error={errors.protein} />
        <TextField name="fat" label={copy.fat} suffix={units.g} inputMode="decimal" autoComplete="off" error={errors.fat} />
        <TextField name="carbs" label={copy.carbs} suffix={units.g} inputMode="decimal" autoComplete="off" error={errors.carbs} />
      </div>
      <TextField name="title" label={copy.title} hint={copy.titleHint} autoComplete="off" maxLength={200} />
      <Button type="submit" size="lg" block loading={pending}>
        {copy.add}
      </Button>
    </form>
  );
}

function MineTab({ shelf, onPick }: { shelf: FoodShelf; onPick: (food: Food) => void }) {
  const { t } = useI18n();
  const copy = t.foodDiary.addScreen;
  return (
    <div className="flex flex-col gap-4">
      {shelf.own.length ? (
        <ListGroup header={copy.own}>
          <FoodRows foods={shelf.own} onPick={onPick} />
        </ListGroup>
      ) : (
        <p className="px-1 text-callout text-ink-2">{copy.ownEmpty}</p>
      )}
      <Button asChild variant="secondary" className="self-start">
        <Link href={OWN_FOODS_PATH}>{copy.manageOwn}</Link>
      </Button>
    </div>
  );
}

/** The amount of a picked food in grams or servings, with what it adds up to (§3.3, §3.6 acceptance 3.1). */
function AmountSheet({
  food,
  day,
  meal,
  favorite: initialFavorite,
  onClose,
  onAdded,
}: {
  food: Food;
  day: string;
  meal: Meal;
  favorite: boolean;
  onClose: () => void;
  onAdded: () => void;
}) {
  const { t, locale } = useI18n();
  const copy = t.foodDiary.amount;
  const weightUnit = portionUnit(locale);
  const oz = weightUnit === "oz";
  /** A weight in grams as the field shows it, in the portion unit. */
  const weightText = (grams: number) => String(portionOfGrams(grams, weightUnit)).replace(".", locale === "ru" ? "," : ".");
  const [unit, setUnit] = useState<"grams" | "servings">(food.servingG ? "servings" : "grams");
  const [text, setText] = useState(food.servingG ? "1" : weightText(100));
  const [error, setError] = useState<string | undefined>();
  const [favorite, setFavoriteState] = useState(initialFavorite);
  const [pending, startTransition] = useTransition();

  const value = unit === "servings" ? parseAmount(text, 0.01, SERVINGS_MAX) : parseAmount(text, ...portionRange(weightUnit));
  const grams = typeof value === "number" ? (unit === "servings" ? (food.servingG ?? 0) * value : gramsOfPortion(value, weightUnit)) : null;
  const totals = grams !== null ? amountOf(food, grams) : null;
  const n = (v: number) => formatValue(locale, v);

  function add() {
    if (typeof value !== "number") {
      setError(unit === "servings" ? t.foodDiary.errors.servings : oz ? t.foodDiary.errors.ounces : t.foodDiary.errors.grams);
      return;
    }
    setError(undefined);
    startTransition(async () => {
      const result = await addEntry(
        unit === "servings" ? { day, meal, foodId: food.id, servings: value } : { day, meal, foodId: food.id, grams: gramsOfPortion(value, weightUnit) },
      );
      if (result.ok) onAdded();
      else toast.error(t.foodDiary.failed);
    });
  }

  function toggleFavorite() {
    const next = !favorite;
    setFavoriteState(next);
    startTransition(async () => {
      const result = await setFavorite(food.id, next);
      if (!result.ok) {
        setFavoriteState(!next);
        toast.error(t.foodDiary.failed);
      }
    });
  }

  return (
    <Sheet
      open
      onOpenChange={(next) => !next && !pending && onClose()}
      title={food.name}
      description={foodSubtitle(t, locale, food)}
      actions={
        <Button size="lg" block loading={pending} onClick={add}>
          {copy.add}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {food.servingG ? (
          <SegmentedControl
            label={copy.unitsLabel}
            value={unit}
            onValueChange={(next) => {
              setUnit(next);
              setText(next === "servings" ? "1" : weightText(food.servingG ?? 100));
            }}
            options={[
              { value: "servings", label: copy.byServings },
              { value: "grams", label: oz ? copy.byOunces : copy.byGrams },
            ]}
          />
        ) : null}
        <TextField
          label={unit === "servings" ? copy.servings : oz ? copy.ounces : copy.grams}
          hint={
            unit === "servings" && food.servingG
              ? interpolate(oz ? copy.servingSizeOz : copy.servingSize, { value: n(portionOfGrams(food.servingG, weightUnit)) })
              : undefined
          }
          suffix={unit === "grams" ? t.nutrition.trainer.units[weightUnit] : undefined}
          inputMode="decimal"
          autoComplete="off"
          value={text}
          onChange={(event) => setText(event.target.value)}
          error={error}
        />
        <p className="px-1 text-callout tabular-nums" aria-live="polite">
          {totals ? interpolate(copy.total, { kcal: n(Math.round(totals.kcal)), protein: n(totals.proteinG), fat: n(totals.fatG), carbs: n(totals.carbsG) }) : " "}
        </p>
        <Button variant="ghost" icon={favorite ? HeartOff : Heart} onClick={toggleFavorite} className="self-start">
          {favorite ? t.foodDiary.addScreen.unfavorite : t.foodDiary.addScreen.favorite}
        </Button>
        {food.source === "off" ? <p className="px-1 text-caption-1 text-ink-3">{t.foodDiary.addScreen.attribution}</p> : null}
      </div>
    </Sheet>
  );
}

