import { Dumbbell } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { ListGroup } from "@/components/ui/list";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import type { LogListPlace } from "@/lib/workouts/log-actions";
import { LOG_PAGE, type LogListItem } from "@/lib/workouts/logs";
import { LogListMore } from "./log-list-more";
import { LogRow } from "./log-row";

type LogListProps = {
  t: Dictionary;
  locale: Locale;
  logs: LogListItem[] | null;
  /** Where a log opens: `${hrefBase}/${id}`. */
  hrefBase: string;
  /** The client sees which logs came from the trainer; the trainer which are the client's own. */
  side: "trainer" | "client";
  empty: { title: string; text: string; action?: React.ReactNode };
  /** Where "Показать ещё" loads older logs from, when the first page is full. */
  more?: LogListPlace;
};

/** Workout logs, newest first (PRD wave-1 §2.10-4), with "Показать ещё" for the older ones. */
export function LogList({ t, locale, logs, hrefBase, side, empty, more }: LogListProps) {
  const copy = t.workouts.logs;
  if (logs === null) return <p className="rounded-lg bg-surface-1 px-4 py-3 text-subhead text-ink-2">{copy.failed}</p>;
  if (!logs.length) return <EmptyState icon={Dumbbell} title={empty.title} description={empty.text} action={empty.action} />;
  const last = logs.at(-1);
  return (
    <ListGroup header={copy.title}>
      {logs.map((log) => (
        <LogRow key={log.id} t={t} locale={locale} log={log} hrefBase={hrefBase} side={side} />
      ))}
      {more && last && logs.length === LOG_PAGE ? (
        <LogListMore place={more} after={{ performedAt: last.performedAt, id: last.id }} pageSize={LOG_PAGE} hrefBase={hrefBase} side={side} />
      ) : null}
    </ListGroup>
  );
}
