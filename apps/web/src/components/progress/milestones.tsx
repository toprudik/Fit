import { DaRing } from "@/components/brand/da-ring";
import { MilestoneRow } from "@/components/pairs/milestone-row";
import { ListGroup, ListRow } from "@/components/ui/list";
import type { Dictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";
import { interpolate, plural } from "@/i18n/format";
import { formatDay } from "@/lib/pairs/format";
import { MILESTONE_SESSIONS, nextMilestone } from "@/lib/pairs/milestones";
import type { PairMilestones } from "@/lib/progress/load";

/**
 * Milestones of one of the client's pairs on "Прогресс" (PRD wave-1 §2.11-9), drawn like "Вехи" on the pair
 * (components/pairs/milestones.tsx): the way to the next mark, then the reached ones, newest first. Only attended
 * sessions count (PROG-8). Nothing before the first attended session.
 */
export function MilestoneGroup({ t, locale, item, header }: { t: Dictionary; locale: Locale; item: PairMilestones; header: string }) {
  if (item.attended === 0 && item.milestones.length === 0) return null;
  const copy = t.pairs.milestones;
  const next = nextMilestone(item.attended, item.milestones);
  return (
    <ListGroup header={header}>
      {next ? (
        <ListRow
          leading={<DaRing state="progress" value={next.share} size={28} />}
          title={interpolate(plural(locale, next.left, copy.next), { sessions: next.sessions })}
        />
      ) : (
        <ListRow leading={<DaRing state="done" size={28} />} title={copy.allReached} />
      )}
      {[...item.milestones].reverse().map((milestone, index) => (
        <MilestoneRow
          key={milestone.id}
          milestoneId={milestone.id}
          achievedAt={milestone.achievedAt}
          newest={index === 0}
          side="client"
          title={plural(locale, MILESTONE_SESSIONS[milestone.kind], t.pairs.together)}
          subtitle={formatDay(locale, milestone.achievedAt, item.timeZone)}
          badge={copy.newBadge}
        />
      ))}
    </ListGroup>
  );
}
