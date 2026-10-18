import { Badge } from "@/components/ui/badge";
import { ListGroup, ListRow } from "@/components/ui/list";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { interpolate } from "@/i18n/format";
import type { BoardRow, ChallengeMetric } from "@/lib/challenges/challenges";
import { challengeScore } from "@/lib/challenges/present";

/**
 * The leaderboard of a challenge (wave-3 §2.4-17): place, avatar, name or alias, the score. The trainer's rows also say
 * who is not shown to the others and whose score is on hold because the client closed the metric.
 */
export function ChallengeBoard({
  t,
  locale,
  metric,
  rows,
  header,
  empty,
  side,
}: {
  t: Dictionary;
  locale: Locale;
  metric: ChallengeMetric;
  rows: BoardRow[];
  header: string;
  empty: string;
  side: "trainer" | "client";
}) {
  const copy = t.challenges;
  return (
    <ListGroup header={header} headingLevel={2}>
      {rows.length === 0 ? <ListRow title={empty} /> : null}
      {rows.map((row) => {
        const notes =
          side === "trainer"
            ? [
                row.alias ? interpolate(copy.trainer.alias, { alias: row.alias }) : null,
                row.shown ? null : copy.trainer.notShown,
                row.hidden ? copy.trainer.hidden : null,
              ].filter((note) => note !== null)
            : [];
        return (
          <ListRow
            key={`${row.place}-${row.name}-${row.isMe}`}
            avatar={{ name: row.name, src: row.photoUrl }}
            title={`${row.place}. ${row.name}`}
            subtitle={
              notes.length ? (
                <span className="flex flex-col">
                  {notes.map((note) => (
                    <span key={note}>{note}</span>
                  ))}
                </span>
              ) : undefined
            }
            value={challengeScore(copy, locale, metric, row.score)}
            trailing={row.isMe ? <Badge tone="accent">{copy.client.me}</Badge> : undefined}
          />
        );
      })}
    </ListGroup>
  );
}
