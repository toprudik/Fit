import { Activity, EyeOff, Smartphone } from "lucide-react";
import { DayNav, dayTitle } from "@/components/nutrition/food-day";
import { EmptyState } from "@/components/ui/empty-state";
import { ListGroup, ListRow } from "@/components/ui/list";
import type { Dictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";
import { interpolate } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import type { ActivityDay } from "@/lib/activity/activity";
import { loadMyActivity, loadPairActivity } from "@/lib/activity/load";
import { formatLocalDay } from "@/lib/passes/present";
import { SleepCard, StepsCard, WaterCard } from "./day-cards";
import { ACTIVITY_PATH, SHORTCUT_PATH } from "./paths";
import { daySummary } from "./summary";

/** The row on "Дневник" that opens the activity (wave-2 §4). */
export function ActivityDiaryEntry({ t }: { t: Dictionary }) {
  return (
    <ListGroup>
      <ListRow icon={Activity} title={t.activity.entry} subtitle={t.activity.entrySubtitle} href={ACTIVITY_PATH} chevron />
    </ListGroup>
  );
}

function WeekList({
  t,
  locale,
  today,
  days,
  shows,
  href,
}: {
  t: Dictionary;
  locale: Locale;
  today: string;
  days: { day: string; activity: ActivityDay }[];
  shows?: { steps: boolean; water: boolean };
  href?: (day: string) => string;
}) {
  return (
    <ListGroup header={t.activity.week} headingLevel={href ? 2 : 3}>
      {days.map(({ day, activity }) => (
        <ListRow
          key={day}
          title={dayTitle(t, locale, day, today)}
          subtitle={daySummary(t, locale, activity, shows) ?? t.activity.nothing}
          href={href?.(day)}
        />
      ))}
    </ListGroup>
  );
}

/** "Активность" of the client (screens.md /client/diary/activity): steps, water and sleep of a day, and the week. */
export async function ClientActivityDay({ day: requested }: { day: string | null }) {
  const [t, locale, data] = await Promise.all([getDictionary(), getLocale(), loadMyActivity(requested)]);
  if (!data) return null;
  const href = (day: string) => (day === data.today ? ACTIVITY_PATH : `${ACTIVITY_PATH}?day=${day}`);
  const current = data.days[0].activity;
  const copy = t.activity.shortcut;
  const tokenLine = data.token
    ? data.token.lastUsedAt
      ? interpolate(copy.lastUsed, { date: formatLocalDay(locale, data.token.lastUsedAt.slice(0, 10)) })
      : copy.neverUsed
    : copy.entrySubtitle;
  return (
    <div className="flex flex-col gap-6">
      <DayNav t={t} locale={locale} day={data.day} today={data.today} href={href} />
      <StepsCard day={data.day} steps={current.steps} goal={data.goals.steps} />
      <WaterCard day={data.day} waterMl={current.waterMl} goal={data.goals.waterMl} />
      <SleepCard day={data.day} sleep={current.sleep} />
      <ListGroup>
        <ListRow icon={Smartphone} title={copy.entry} subtitle={tokenLine} href={SHORTCUT_PATH} chevron />
      </ListGroup>
      <WeekList t={t} locale={locale} today={data.today} days={data.days} href={href} />
    </div>
  );
}

/** Activity on the trainer's "Питание" tab: the client's last days, each metric only when its share is on. */
export async function TrainerActivity({ coachingId }: { coachingId: string }) {
  const [t, locale, data] = await Promise.all([getDictionary(), getLocale(), loadPairActivity(coachingId)]);
  if (!data) return null;
  const copy = t.activity.trainer;
  const { shows } = data;
  if (!shows.steps && !shows.water) {
    return (
      <section aria-labelledby="pair-activity" className="flex flex-col gap-3">
        <h2 id="pair-activity" className="text-title-3">
          {copy.title}
        </h2>
        <EmptyState icon={EyeOff} title={copy.hidden} />
      </section>
    );
  }
  return (
    <section aria-labelledby="pair-activity" className="flex flex-col gap-3">
      <h2 id="pair-activity" className="text-title-3">
        {copy.title}
      </h2>
      <WeekList t={t} locale={locale} today={data.today} days={data.days} shows={shows} />
      {!shows.steps ? <p className="px-4 text-footnote text-ink-2">{copy.stepsHidden}</p> : null}
      {!shows.water ? <p className="px-4 text-footnote text-ink-2">{copy.waterHidden}</p> : null}
    </section>
  );
}
