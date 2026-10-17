import { DaRing } from "@/components/brand/da-ring";
import { ListGroup, ListRow } from "@/components/ui/list";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { interpolate, plural } from "@/i18n/format";
import { formatDay } from "@/lib/pairs/format";
import type { PairDetail } from "@/lib/pairs/load";
import { MILESTONE_SESSIONS, nextMilestone } from "@/lib/pairs/milestones";
import { MilestoneRow } from "./milestone-row";

/**
 * "Вехи" of a pair (PRD wave-1 §2.11-9, PROG-8), the same for the trainer and the client: the way to the next of
 * 10/25/50/100 attended sessions, then the milestones reached, newest first. A milestone reached in the last two
 * weeks plays the Da-moment on the viewer's first visit. Nothing before the first attended session.
 */
export function PairMilestones({ t, locale, pair }: { t: Dictionary; locale: Locale; pair: PairDetail }) {
  if (pair.attended === 0 && pair.milestones.length === 0) return null;
  const copy = t.pairs.milestones;
  const next = nextMilestone(pair.attended, pair.milestones);
  const reached = [...pair.milestones].reverse();
  return (
    <ListGroup header={copy.title}>
      {next ? (
        <ListRow
          leading={<DaRing state="progress" value={next.share} size={28} />}
          title={interpolate(plural(locale, next.left, copy.next), { sessions: next.sessions })}
        />
      ) : (
        <ListRow leading={<DaRing state="done" size={28} />} title={copy.allReached} />
      )}
      {reached.map((milestone, index) => (
        <MilestoneRow
          key={milestone.id}
          milestoneId={milestone.id}
          achievedAt={milestone.achievedAt}
          newest={index === 0}
          side={pair.side}
          title={plural(locale, MILESTONE_SESSIONS[milestone.kind], t.pairs.together)}
          date={formatDay(locale, milestone.achievedAt, pair.timeZone)}
          badge={copy.newBadge}
        />
      ))}
    </ListGroup>
  );
}
