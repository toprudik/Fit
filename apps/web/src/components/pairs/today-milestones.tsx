import { DaRing } from "@/components/brand/da-ring";
import { ListGroup, ListRow } from "@/components/ui/list";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { interpolate, plural } from "@/i18n/format";
import { loadTodayMilestones } from "@/lib/pairs/load";
import { MILESTONE_SESSIONS } from "@/lib/pairs/milestones";
import { MilestoneRow } from "./milestone-row";

/**
 * "Вехи" on the trainer's "Сегодня" (screens.md): milestones clients reached in the last two weeks, each playing the
 * Da-moment once as on the pair screen, then the clients whose next session reaches one. Nothing when there are none.
 */
export async function TodayMilestones({ t, locale }: { t: Dictionary; locale: Locale }) {
  const milestones = await loadTodayMilestones();
  if (!milestones || (!milestones.reached.length && !milestones.upcoming.length)) return null;
  const copy = t.screens.trainer.today.milestones;
  const seen = new Set<string>();
  return (
    <ListGroup header={t.pairs.milestones.title} className="w-full max-w-2xl">
      {milestones.reached.map(({ coachingId, name, milestone }) => {
        const newest = !seen.has(coachingId);
        seen.add(coachingId);
        return (
          <MilestoneRow
            key={milestone.id}
            milestoneId={milestone.id}
            achievedAt={milestone.achievedAt}
            newest={newest}
            side="trainer"
            title={name}
            subtitle={plural(locale, MILESTONE_SESSIONS[milestone.kind], t.pairs.together)}
            badge={t.pairs.milestones.newBadge}
            href={`/trainer/clients/${coachingId}`}
          />
        );
      })}
      {milestones.upcoming.map(({ coachingId, name, sessions, share }) => (
        <ListRow
          key={coachingId}
          leading={<DaRing state="progress" value={share} size={28} />}
          title={name}
          subtitle={interpolate(copy.upcoming, { sessions })}
          href={`/trainer/clients/${coachingId}`}
        />
      ))}
    </ListGroup>
  );
}
