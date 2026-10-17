import { Award } from "lucide-react";
import { ClientChallengesEntry } from "@/components/challenges/sections";
import { Badge } from "@/components/ui/badge";
import { ListGroup, ListRow } from "@/components/ui/list";
import type { Dictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";
import { interpolate } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import { BADGE_CODES, badgeItems, type EarnedBadge } from "@/lib/gamification/gamification";
import { loadMyGamification, loadPairGamification } from "@/lib/gamification/load";
import { formatDay } from "@/lib/pairs/format";
import { BadgeList, type BadgeRow } from "./badge-list";
import { StreakTiles } from "./streak-tiles";
import { WeekGoalButton } from "./week-goal";

export const BADGES_PATH = "/client/progress/badges";

function rowsOf(t: Dictionary, locale: Locale, badges: EarnedBadge[], timeZone: string): BadgeRow[] {
  return badgeItems(badges).map((item) => ({
    code: item.code,
    isNew: item.isNew,
    earnedOn: item.awardedAt ? interpolate(t.gamification.badges.earnedOn, { date: formatDay(locale, item.awardedAt, timeZone) }) : null,
  }));
}

/** "Серии и значки" on the client's "Прогресс": the streaks and the row that opens the badges. */
export async function ClientGamificationEntry() {
  const [t, locale, data] = await Promise.all([getDictionary(), getLocale(), loadMyGamification()]);
  if (!data) return null;
  const copy = t.gamification;
  const fresh = data.badges.some((badge) => !badge.seen);
  return (
    <section aria-labelledby="streaks-badges" className="flex flex-col gap-3">
      <h2 id="streaks-badges" className="px-4 text-footnote text-ink-2">
        {copy.title}
      </h2>
      <StreakTiles t={t} locale={locale} streaks={data.streaks} />
      <ListGroup>
        <ListRow
          icon={Award}
          title={copy.badges.entry}
          value={interpolate(copy.badges.count, { earned: data.badges.length, total: BADGE_CODES.length })}
          trailing={fresh ? <Badge tone="accent">{copy.badges.new}</Badge> : undefined}
          href={BADGES_PATH}
          chevron
        />
      </ListGroup>
      <ClientChallengesEntry t={t} locale={locale} />
    </section>
  );
}

/** "Значки" of the client (screens.md /client/progress/badges): the streaks with the weekly goal, then every badge. */
export async function ClientBadges() {
  const [t, locale, data] = await Promise.all([getDictionary(), getLocale(), loadMyGamification()]);
  if (!data) return null;
  const copy = t.gamification;
  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="streaks" className="flex flex-col gap-3">
        <h2 id="streaks" className="px-4 text-footnote text-ink-2">
          {copy.streaks.header}
        </h2>
        <StreakTiles t={t} locale={locale} streaks={data.streaks} />
        <WeekGoalButton clientId={data.userId} current={data.streaks.weekGoal} side="client" />
        <p className="px-4 text-footnote text-ink-2">{copy.streaks.rules}</p>
      </section>
      <BadgeList
        rows={rowsOf(t, locale, data.badges, data.timeZone)}
        header={interpolate(copy.badges.count, { earned: data.badges.length, total: BADGE_CODES.length })}
        markSeen
      />
    </div>
  );
}

/** "Серии и значки" on the trainer's client card: the client's streaks as the shares allow, the goal, the badges. */
export async function TrainerGamification({ coachingId }: { coachingId: string }) {
  const [t, locale, data] = await Promise.all([getDictionary(), getLocale(), loadPairGamification(coachingId)]);
  if (!data) return null;
  const copy = t.gamification;
  const earned = rowsOf(t, locale, data.badges, data.timeZone).filter((row) => row.earnedOn);
  return (
    <section aria-labelledby="pair-gamification" className="flex flex-col gap-3">
      <h2 id="pair-gamification" className="px-4 text-footnote text-ink-2">
        {copy.trainer.title}
      </h2>
      <StreakTiles t={t} locale={locale} streaks={data.streaks} />
      {data.streaks.diary === null ? <p className="px-4 text-footnote text-ink-2">{copy.trainer.hiddenDiary}</p> : null}
      {data.streaks.steps === null ? <p className="px-4 text-footnote text-ink-2">{copy.trainer.hiddenSteps}</p> : null}
      <WeekGoalButton clientId={data.userId} current={data.streaks.weekGoal} side="trainer" />
      {earned.length ? (
        <BadgeList
          rows={earned.map((row) => ({ ...row, isNew: false }))}
          header={interpolate(copy.badges.count, { earned: earned.length, total: BADGE_CODES.length })}
          markSeen={false}
        />
      ) : (
        <p className="px-4 text-footnote text-ink-2">{copy.badges.none}</p>
      )}
    </section>
  );
}
