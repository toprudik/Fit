import { ChevronLeft, ChevronRight, Utensils } from "lucide-react";
import Link from "next/link";
import { WaterCard } from "@/components/activity/day-cards";
import { DaRing } from "@/components/brand/da-ring";
import { IconButton } from "@/components/ui/icon-button";
import { ListGroup, ListRow } from "@/components/ui/list";
import type { Dictionary } from "@/i18n/dictionaries";
import { INTL_LOCALE, type Locale } from "@/i18n/config";
import { interpolate } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import { formatDiaryDay, shareOf, shiftDay, totalsOf, type Totals } from "@/lib/nutrition/diary";
import { loadMyActivity } from "@/lib/activity/load";
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

const MACROS = ["protein", "fat", "carbs"] as const;

/** Eaten against the target of the day (§3.9): a ring for kcal with what is left, and a ring per macro when set. */
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
  const eaten = { protein: totals.proteinG, fat: totals.fatG, carbs: totals.carbsG };
  const goals = macros ? { protein: macros.proteinG, fat: macros.fatG, carbs: macros.carbsG } : null;
  const kcalText = macros
    ? interpolate(copy.ofTarget, { eaten: n(Math.round(totals.kcal)), target: n(macros.kcal) })
    : interpolate(copy.eaten, { value: n(Math.round(totals.kcal)) });

  return (
    <section aria-label={copy.label} className="flex flex-col gap-4 rounded-lg bg-surface-1 p-4">
      <div className="flex items-center gap-4">
        {share !== null ? <DaRing state="progress" value={share} size={64} /> : null}
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-title-2 tabular-nums">{kcalText}</p>
          {rest !== null ? (
            <p className="text-subhead text-ink-2">{rest >= 0 ? interpolate(copy.left, { value: n(rest) }) : interpolate(copy.over, { value: n(-rest) })}</p>
          ) : (
            <p className="text-subhead text-ink-2">{target && "otherTrainer" in target ? copy.otherTrainer : copy.noTarget}</p>
          )}
        </div>
      </div>
      {goals && MACROS.every((key) => goals[key] !== null) ? (
        <ul className="grid grid-cols-3 gap-2">
          {MACROS.map((key) => (
            <li key={key} className="flex min-w-0 flex-col items-center gap-1 text-center">
              <DaRing state="progress" value={shareOf(eaten[key], goals[key]) ?? 0} size={28} />
              <span className="text-footnote text-ink-2">{copy.macroNames[key]}</span>
              <span className="text-footnote whitespace-nowrap tabular-nums">
                {interpolate(copy.macroOf, { value: n(eaten[key]), target: n(goals[key] ?? 0) })}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-footnote text-ink-2 tabular-nums">
          {interpolate(copy.macros, { protein: n(eaten.protein), fat: n(eaten.fat), carbs: n(eaten.carbs) })}
        </p>
      )}
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
  const [t, locale, data, activity] = await Promise.all([getDictionary(), getLocale(), loadMyFoodDay(requested), loadMyActivity(requested)]);
  if (!data) return null;
  const water = activity?.days.find((entry) => entry.day === data.day)?.activity.waterMl ?? 0;
  const href = (day: string) => (day === data.today ? FOOD_PATH : `${FOOD_PATH}?day=${day}`);
  return (
    <div className="flex flex-col gap-6">
      <DayNav t={t} locale={locale} day={data.day} today={data.today} href={href} />
      <DaySummary t={t} locale={locale} totals={totalsOf(data.entries)} target={data.target} showSetTarget />
      <MealList day={data.day} entries={data.entries} previousMeals={data.previousMeals} />
      {/* Water is part of the day's food (§3.9); the card is the activity diary's own (wave-2 §4.5). */}
      {activity ? <WaterCard day={data.day} waterMl={water} goal={activity.goals.waterMl} /> : null}
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
