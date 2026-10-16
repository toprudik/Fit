import { Trophy } from "lucide-react";
import Link from "next/link";
import { ListGroup, ListRow } from "@/components/ui/list";
import { getDictionary, getLocale } from "@/i18n/server";
import { loadRecords, viewerId, viewerTimeZone } from "@/lib/workouts/logs";
import { formatLogDay, formatRecord } from "@/lib/workouts/present";
import { weightUnit } from "@/lib/workouts/units";
import { localDay } from "@/lib/passes/present";

/** The client's personal records by exercise (PRD wave-1 §2.10-6, WORK-4); nothing until the first logs. */
export async function ClientRecords({ empty, limit }: { empty: React.ReactNode; limit?: number }) {
  const [t, locale, me, timeZone] = await Promise.all([getDictionary(), getLocale(), viewerId(), viewerTimeZone()]);
  const records = me ? await loadRecords(me, locale) : null;
  if (!records?.length) return empty;
  const copy = t.workouts.logs;
  const unit = weightUnit(locale);
  return (
    <ListGroup
      header={copy.recordsTitle}
      footer={
        limit && records.length > limit ? (
          <Link href="/client/progress/records" className="font-semibold text-accent-ink">
            {copy.recordsLink}
          </Link>
        ) : undefined
      }
    >
      {records.slice(0, limit).map((record) => (
        <ListRow
          key={`${record.exerciseId}-${record.type}`}
          icon={Trophy}
          title={record.name}
          subtitle={`${copy.recordTypes[record.type]} · ${formatLogDay(locale, localDay(record.achievedAt, timeZone))}`}
          value={formatRecord(t, locale, record, unit)}
        />
      ))}
    </ListGroup>
  );
}
