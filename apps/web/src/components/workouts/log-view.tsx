import { Pencil, Trophy } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { interpolate } from "@/i18n/format";
import type { LogDetails } from "@/lib/workouts/logs";
import { formatLogDay, formatSet } from "@/lib/workouts/present";
import { weightUnit } from "@/lib/workouts/units";
import { DeleteLog } from "./delete-log";

/**
 * One workout log (PRD wave-1 §2.10-4, WORK-4): the date and length, then each exercise with its sets;
 * a set that is the client's record gets a "Рекорд" badge. The author edits, the client deletes.
 */
export function LogView({
  t,
  locale,
  log,
  side,
  hrefBase,
  listHref,
}: {
  t: Dictionary;
  locale: Locale;
  log: LogDetails;
  side: "trainer" | "client";
  hrefBase: string;
  listHref: string;
}) {
  const copy = t.workouts.logs;
  const unit = weightUnit(locale);
  return (
    <div className="flex w-full max-w-2xl flex-col gap-6 pt-4 md:pt-0">
      <p className="px-1 text-subhead text-ink-2">
        {[formatLogDay(locale, log.localDate), log.durationMin ? interpolate(copy.minutes, { count: log.durationMin }) : null]
          .filter(Boolean)
          .join(" · ")}
        {side === "client" && log.coachingId ? (
          <>
            {" "}
            <Badge tone="accent">{copy.fromPair}</Badge>
          </>
        ) : null}
      </p>
      {log.exercises.map((exercise, index) => (
        <section key={`${exercise.exerciseId}-${index}`} className="flex flex-col gap-1.5" aria-labelledby={`log-exercise-${index}`}>
          <h2 id={`log-exercise-${index}`} className="px-4 text-headline">
            {exercise.name}
          </h2>
          <ol className="overflow-hidden rounded-lg bg-surface-1">
            {exercise.sets.length === 0 ? <li className="px-4 py-3 text-subhead text-ink-2">{copy.noSets}</li> : null}
            {exercise.sets.map((set, n) => (
              <li key={set.id} className="flex min-h-11 items-center gap-3 border-t border-line px-4 py-2 first:border-t-0">
                <span className="w-6 text-footnote text-ink-2 tabular-nums">{n + 1}</span>
                <span className="flex-1 text-body tabular-nums">{formatSet(t, locale, set, unit)}</span>
                {set.warmup ? <Badge>{copy.warmup}</Badge> : null}
                {set.record ? (
                  <Badge tone="success" icon={Trophy}>
                    {copy.record}
                  </Badge>
                ) : null}
              </li>
            ))}
          </ol>
          {exercise.notes ? <p className="px-4 text-subhead whitespace-pre-line text-ink-2">{exercise.notes}</p> : null}
        </section>
      ))}
      {log.notes ? (
        <section className="flex flex-col gap-1.5" aria-labelledby="log-notes">
          <h2 id="log-notes" className="px-4 text-footnote text-ink-2">
            {copy.notes}
          </h2>
          <p className="rounded-lg bg-surface-1 px-4 py-3 text-body whitespace-pre-line">{log.notes}</p>
        </section>
      ) : null}
      <div className="flex flex-col gap-3">
        {log.editable ? (
          <Link href={`${hrefBase}/${log.id}/edit`} className={buttonVariants({ variant: "secondary", block: true })}>
            <Pencil aria-hidden size={20} />
            {copy.edit}
          </Link>
        ) : (
          <p className="px-1 text-footnote text-ink-2">{copy.readOnly}</p>
        )}
        {log.deletable ? <DeleteLog id={log.id} listHref={listHref} /> : null}
      </div>
    </div>
  );
}
