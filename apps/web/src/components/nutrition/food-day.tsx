import { ChevronLeft, ChevronRight, Utensils } from "lucide-react";
import Link from "next/link";
import { IconButton } from "@/components/ui/icon-button";
import { ListGroup, ListRow } from "@/components/ui/list";
import type { Dictionary } from "@/i18n/dictionaries";
import { INTL_LOCALE, type Locale } from "@/i18n/config";
import { interpolate } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import { formatDiaryDay, shareOf, shiftDay, totalsOf, type Totals } from "@/lib/nutrition/diary";
import { loadMyFoodDay, type DayTarget } from "@/lib/nutrition/diary-load";
import { formatValue } from "@/lib/progress/measurements";
import { ClientComments } from "./client-comments";
import { MealList } from "./meal-list";
import { FOOD_PATH, TARGET_PATH } from "./paths";

/** "Сегодня", "Вчера" or the date. */
export function dayTitle(t: Dictionary, locale: Locale, day: string, today: string): string {
  if (day === today) return t.foodDiary.day.today;
  if (day === shiftDay(today, -1)) return t.foodDiary.day.yesterday;
  return formatDiaryDay(INTL_LOCALE[locale], day, today);
}

/** The day switcher above the diary: the previous day always, the next one up to today. */
export function DayNav({ t, locale, day, today, href }: { t: Dictionary; locale: Locale; day: string; today: string; href: (day: string) => string }) {
  const copy = t.foodDiary.day;
  return (
    <nav aria-label={t.foodDiary.summary.label} className="flex items-center justify-between gap-2">
      <IconButton icon={ChevronLeft} label={copy.previous} asChild>
        <Link href={href(shiftDay(day, -1))} />
      </IconButton>
      <h2 className="text-headline">{dayTitle(t, locale, day, today)}</h2>
      {day < today ? (
        <IconButton icon={ChevronRight} label={copy.next} asChild>
          <Link href={href(shiftDay(day, 1))} />
        </IconButton>
      ) : (
        <span className="size-11" aria-hidden />
      )}
    </nav>
  );
}

/** Eaten against the target of the day: a bar for kcal and the macros as text (§3.9). */
export function DaySummary({
  t,
  locale,
  totals,
  target,
  showSetTarget,
}: {
  t: Dictionary;
  locale: Locale;
  totals: Totals;
  target: DayTarget;
  /** The client may work a target out; the trainer only reads. */
  showSetTarget: boolean;
}) {
  const copy = t.foodDiary.summary;
  const n = (value: number) => formatValue(locale, value);
  const macros = target && "macros" in target ? target.macros : null;
  const share = shareOf(totals.kcal, macros?.kcal ?? null);
  const rest = macros ? Math.round(macros.kcal - totals.kcal) : null;
  const macrosText =
    macros && macros.proteinG !== null && macros.fatG !== null && macros.carbsG !== null
      ? interpolate(copy.macrosOf, {
          protein: n(totals.proteinG),
          proteinTarget: n(macros.proteinG),
          fat: n(totals.fatG),
          fatTarget: n(macros.fatG),
          carbs: n(totals.carbsG),
          carbsTarget: n(macros.carbsG),
        })
      : interpolate(copy.macros, { protein: n(totals.proteinG), fat: n(totals.fatG), carbs: n(totals.carbsG) });

  return (
    <section aria-label={copy.label} className="flex flex-col gap-2 rounded-lg bg-surface-1 p-4">
      <p className="text-title-2 tabular-nums">
        {macros ? interpolate(copy.ofTarget, { eaten: n(Math.round(totals.kcal)), target: n(macros.kcal) }) : interpolate(copy.eaten, { value: n(Math.round(totals.kcal)) })}
      </p>
      {share !== null ? (
        <div
          role="progressbar"
          aria-label={copy.label}
          aria-valuemin={0}
          aria-valuemax={macros?.kcal}
          aria-valuenow={Math.round(totals.kcal)}
          className="h-2 overflow-hidden rounded-full bg-surface-3"
        >
          <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round(share * 100)}%` }} />
        </div>
      ) : null}
      {rest !== null ? (
        <p className="text-subhead text-ink-2">{rest >= 0 ? interpolate(copy.left, { value: n(rest) }) : interpolate(copy.over, { value: n(-rest) })}</p>
      ) : (
        <p className="text-subhead text-ink-2">{target && "otherTrainer" in target ? copy.otherTrainer : copy.noTarget}</p>
      )}
      <p className="text-footnote text-ink-2 tabular-nums">{macrosText}</p>
      {showSetTarget && !target ? (
        <Link href={TARGET_PATH} className="text-subhead font-semibold text-accent-ink">
          {copy.setTarget}
        </Link>
      ) : null}
    </section>
  );
}

/** "Питание" of the client (screens.md /client/diary/food): the day, its total against the target, meals, comments. */
export async function ClientFoodDay({ day: requested }: { day: string | null }) {
  const [t, locale, data] = await Promise.all([getDictionary(), getLocale(), loadMyFoodDay(requested)]);
  if (!data) return null;
  const href = (day: string) => (day === data.today ? FOOD_PATH : `${FOOD_PATH}?day=${day}`);
  return (
    <div className="flex flex-col gap-6">
      <DayNav t={t} locale={locale} day={data.day} today={data.today} href={href} />
      <DaySummary t={t} locale={locale} totals={totalsOf(data.entries)} target={data.target} showSetTarget />
      <MealList day={data.day} entries={data.entries} previousMeals={data.previousMeals} />
      <ClientComments comments={data.comments} />
    </div>
  );
}

/** The row on "Дневник" that opens the food diary. */
export function FoodDiaryEntry({ t }: { t: Dictionary }) {
  return (
    <ListGroup>
      <ListRow icon={Utensils} title={t.foodDiary.entry} subtitle={t.foodDiary.entrySubtitle} href={FOOD_PATH} chevron />
    </ListGroup>
  );
}
