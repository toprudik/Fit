import { Badge } from "@/components/ui/badge";
import { ListRow } from "@/components/ui/list";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import type { LogListItem } from "@/lib/workouts/logs";
import { formatLogDay } from "@/lib/workouts/present";

/** One log in a list: date, title and the exercises in one line. */
export function LogRow({
  t,
  locale,
  log,
  hrefBase,
  side,
}: {
  t: Dictionary;
  locale: Locale;
  log: LogListItem;
  hrefBase: string;
  side: "trainer" | "client";
}) {
  const copy = t.workouts.logs;
  return (
    <ListRow
      href={`${hrefBase}/${log.id}`}
      title={log.title || copy.untitled}
      subtitle={[formatLogDay(locale, log.localDate), log.exercises.filter(Boolean).join(", ")].filter(Boolean).join(" · ")}
      trailing={side === "client" && log.fromPair ? <Badge tone="accent">{copy.fromPair}</Badge> : null}
    />
  );
}
