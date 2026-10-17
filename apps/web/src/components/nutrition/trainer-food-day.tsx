import { NotebookText } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { getDictionary, getLocale } from "@/i18n/server";
import { totalsOf } from "@/lib/nutrition/diary";
import { loadPairFoodDay } from "@/lib/nutrition/diary-load";
import { DayNav, DaySummary } from "./food-day";
import { ReadOnlyMeals } from "./read-only-meals";
import { TrainerComments } from "./trainer-comments";

/** The client's food diary on the trainer's «Питание» tab (§3.11, §5): a day, its total, meals and comments. */
export async function TrainerFoodDay({ coachingId, day: requested }: { coachingId: string; day?: string }) {
  const [t, locale, data] = await Promise.all([getDictionary(), getLocale(), loadPairFoodDay(coachingId, requested)]);
  if (!data || data.state === "closed") return null;
  const copy = t.foodDiary.trainer;
  const base = `/trainer/clients/${coachingId}/nutrition`;
  const href = (day: string) => (day === data.today ? base : `${base}?day=${day}`);
  return (
    <section aria-labelledby="client-food-diary" className="flex flex-col gap-4">
      <h2 id="client-food-diary" className="px-1 text-title-3">
        {copy.title}
      </h2>
      <DayNav t={t} locale={locale} day={data.day} today={data.today} href={href} />
      <DaySummary t={t} locale={locale} totals={totalsOf(data.entries)} target={data.target} showSetTarget={false} />
      {data.entries.length ? <ReadOnlyMeals entries={data.entries} /> : <EmptyState icon={NotebookText} title={copy.empty} headingLevel={3} />}
      <TrainerComments coachingId={coachingId} day={data.day} comments={data.comments} me={data.me} />
    </section>
  );
}
