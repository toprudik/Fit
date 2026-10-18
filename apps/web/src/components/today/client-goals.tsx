import { getDictionary, getLocale } from "@/i18n/server";
import { loadMyActivity } from "@/lib/activity/load";
import { loadMyGamification } from "@/lib/gamification/load";
import { loadClientHomework } from "@/lib/homework/load";
import { totalsOf } from "@/lib/nutrition/diary";
import { loadMyFoodDay } from "@/lib/nutrition/diary-load";
import { ClientGoalsView } from "./client-goals-view";

/** Loads today's goals for the signed-in client; renders nothing when signed out. */
export async function ClientTodayGoals() {
  const [t, locale] = await Promise.all([getDictionary(), getLocale()]);
  const [food, activity, homework, gamification] = await Promise.all([
    loadMyFoodDay(),
    loadMyActivity(),
    loadClientHomework(locale),
    loadMyGamification(),
  ]);
  if (!food || !activity) return null;
  const target = food.target && "macros" in food.target ? food.target.macros.kcal : null;
  const open = homework?.homework.length
    ? homework.homework.flatMap((h) => h.occurrences).filter((o) => !o.doneAt && o.dueOn <= homework.today).length
    : null;
  return (
    <ClientGoalsView
      t={t}
      locale={locale}
      goals={{
        today: food.today,
        food: { eaten: totalsOf(food.entries).kcal, target },
        steps: { done: activity.days[0]?.activity.steps?.value ?? 0, goal: activity.goals.steps },
        homework: open,
        streaks: gamification?.streaks ?? null,
      }}
    />
  );
}
