import { Dumbbell } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ListGroup, ListRow } from "@/components/ui/list";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import type { LogListItem } from "@/lib/workouts/logs";
import { formatLogDay } from "@/lib/workouts/present";

type LogListProps = {
  t: Dictionary;
  locale: Locale;
  logs: LogListItem[] | null;
  /** Where a log opens: `${hrefBase}/${id}`. */
  hrefBase: string;
  /** The client sees which logs came from the trainer; the trainer which are the client's own. */
  side: "trainer" | "client";
  empty: { title: string; text: string; action?: React.ReactNode };
};

/** Workout logs, newest first (PRD wave-1 §2.10-4): date, title and the exercises in one line. */
export function LogList({ t, locale, logs, hrefBase, side, empty }: LogListProps) {
  const copy = t.workouts.logs;
  if (logs === null) return <p className="rounded-lg bg-surface-1 px-4 py-3 text-subhead text-ink-2">{copy.failed}</p>;
  if (!logs.length) return <EmptyState icon={Dumbbell} title={empty.title} description={empty.text} action={empty.action} />;
  return (
    <ListGroup header={copy.title}>
      {logs.map((log) => (
        <ListRow
          key={log.id}
          href={`${hrefBase}/${log.id}`}
          title={log.title || copy.untitled}
          subtitle={[formatLogDay(locale, log.localDate), log.exercises.filter(Boolean).join(", ")].filter(Boolean).join(" · ")}
          trailing={side === "client" && log.fromPair ? <Badge tone="accent">{copy.fromPair}</Badge> : null}
        />
      ))}
    </ListGroup>
  );
}
