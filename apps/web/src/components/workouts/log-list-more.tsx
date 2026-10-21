"use client";

import { useState, useTransition } from "react";
import { ListRow } from "@/components/ui/list";
import { toast } from "@/components/ui/sonner";
import { useI18n } from "@/i18n/client";
import { type LogListPlace, moreLogs } from "@/lib/workouts/log-actions";
import type { LogCursor, LogListItem } from "@/lib/workouts/logs";
import { LogRow } from "./log-row";

/** "Показать ещё" at the end of a full page of logs: loads the older ones below, a page at a time. */
export function LogListMore({
  place,
  after,
  pageSize,
  hrefBase,
  side,
}: {
  place: LogListPlace;
  after: LogCursor;
  pageSize: number;
  hrefBase: string;
  side: "trainer" | "client";
}) {
  const { t, locale } = useI18n();
  const [logs, setLogs] = useState<LogListItem[]>([]);
  const [cursor, setCursor] = useState<LogCursor | null>(after);
  const [pending, startTransition] = useTransition();

  function loadMore() {
    if (!cursor || pending) return;
    startTransition(async () => {
      const page = await moreLogs({ place, before: cursor, locale });
      if (!page) {
        toast.error(t.workouts.logs.failed);
        return;
      }
      setLogs((shown) => [...shown, ...page]);
      const last = page.at(-1);
      setCursor(page.length === pageSize && last ? { performedAt: last.performedAt, id: last.id } : null);
    });
  }

  return (
    <>
      {logs.map((log) => (
        <LogRow key={log.id} t={t} locale={locale} log={log} hrefBase={hrefBase} side={side} />
      ))}
      {cursor ? (
        <ListRow title={pending ? t.common.loading : t.workouts.logs.showMore} onClick={loadMore} chevron={false} />
      ) : null}
    </>
  );
}
