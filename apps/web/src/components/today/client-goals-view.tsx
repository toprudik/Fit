import { ClipboardCheck, Footprints, Utensils } from "lucide-react";
import { ACTIVITY_PATH } from "@/components/activity/paths";
import { StreakTiles } from "@/components/gamification/streak-tiles";
import { FOOD_PATH } from "@/components/nutrition/paths";
import { ListGroup, ListRow } from "@/components/ui/list";
import { INTL_LOCALE, type Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { interpolate } from "@/i18n/format";
import type { Streaks } from "@/lib/gamification/gamification";
import { QuickWeight } from "./quick-weight";

export type ClientGoals = {
  /** The client's local day, YYYY-MM-DD: the quick weight goes on it. */
  today: string;
  food: { eaten: number; target: number | null };
  steps: { done: number; goal: number };
  /** Homework deadlines that came and are not done; null when the client has no homework. */
  homework: number | null;
  streaks: Streaks | null;
};

/** Whether any streak has started, so empty tiles don't fill a new client's home. */
function anyStreak(streaks: Streaks): boolean {
  return streaks.workouts > 0 || (streaks.diary ?? 0) > 0 || (streaks.steps ?? 0) > 0;
}

/**
 * Today's goals on the client's home (screens.md §3.1): calories against the norm, steps against the goal, homework
 * that is due, the quick weight entry and the streaks. Each goal opens its screen.
 */
export function ClientGoalsView({ t, locale, goals }: { t: Dictionary; locale: Locale; goals: ClientGoals }) {
  const copy = t.screens.client.home;
  const number = new Intl.NumberFormat(INTL_LOCALE[locale]);
  const food =
    goals.food.target === null
      ? interpolate(copy.kcal, { eaten: number.format(Math.round(goals.food.eaten)) })
      : interpolate(copy.kcalOf, { eaten: number.format(Math.round(goals.food.eaten)), target: number.format(goals.food.target) });
  return (
    <>
      <ListGroup header={copy.goals}>
        <ListRow icon={Utensils} title={copy.food} value={food} href={FOOD_PATH} />
        <ListRow
          icon={Footprints}
          title={copy.steps}
          value={interpolate(copy.stepsOf, { done: number.format(goals.steps.done), goal: number.format(goals.steps.goal) })}
          href={ACTIVITY_PATH}
        />
        {goals.homework !== null ? (
          <ListRow
            icon={ClipboardCheck}
            title={t.homework.open}
            subtitle={goals.homework ? interpolate(t.homework.openCount, { count: goals.homework }) : undefined}
            href="/client/sessions/homework"
          />
        ) : null}
      </ListGroup>
      <section aria-label={copy.quick} className="flex flex-col gap-2">
        <h2 className="px-1 text-footnote text-ink-2">{copy.quick}</h2>
        <QuickWeight today={goals.today} />
      </section>
      {goals.streaks && anyStreak(goals.streaks) ? <StreakTiles t={t} locale={locale} streaks={goals.streaks} /> : null}
    </>
  );
}
