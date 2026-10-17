import { Award, CalendarHeart, CircleCheck, Flag } from "lucide-react";
import { ListGroup, ListRow } from "@/components/ui/list";
import type { Dictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";
import { interpolate, plural } from "@/i18n/format";
import { formatLocalDay, localDay } from "@/lib/passes/present";
import { MILESTONE_SESSIONS, type PairMilestones } from "@/lib/progress/load";

const THRESHOLDS = Object.values(MILESTONE_SESSIONS).sort((a, b) => a - b);

/**
 * Milestones of one pair (PRD wave-1 §2.11-9): "Вместе с …", attended sessions, the 10/25/50/100 marks reached
 * and the next one. Shown to both sides; only attended sessions count (PROG-8).
 */
export function MilestoneGroup({ t, locale, item, header }: { t: Dictionary; locale: Locale; item: PairMilestones; header: string }) {
  const copy = t.progress.milestones;
  const next = THRESHOLDS.find((count) => count > item.attended);
  return (
    <ListGroup header={header}>
      <ListRow
        icon={CalendarHeart}
        title={interpolate(copy.together, { date: formatLocalDay(locale, localDay(item.startedAt, item.timeZone)) })}
      />
      <ListRow icon={CircleCheck} title={plural(locale, item.attended, copy.attended)} />
      {[...item.reached].reverse().map((count) => (
        <ListRow key={count} icon={Award} iconTone="accent" title={plural(locale, count, copy.reached)} />
      ))}
      {next ? <ListRow icon={Flag} title={interpolate(copy.next, { count: plural(locale, next, copy.sessions) })} /> : null}
    </ListGroup>
  );
}
