import { CalendarCheck, CalendarDays, ClipboardCheck, Dumbbell, Footprints, Moon, Ruler, Trophy, Utensils } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { ListGroup, ListRow } from "@/components/ui/list";
import { formatNumber, interpolate, plural } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import { loadMonthlyReport } from "@/lib/monthly-report/load";
import { formatMonth, formatSleep, monthParam, storyOptions } from "@/lib/monthly-report/report";
import { formatMeasurement, type MeasurementKind } from "@/lib/progress/measurements";
import { formatRecord } from "@/lib/workouts/present";
import { weightUnit } from "@/lib/workouts/units";
import { StoryCards } from "./story-cards";

const MINUS = "−";

/** The client's finished month (PRD wave-3 §4-2): only the sections that had data, then the story cards. */
export async function MonthlyReportView({ month }: { month: string }) {
  const [t, locale, report] = await Promise.all([getDictionary(), getLocale(), loadMonthlyReport(month)]);
  const copy = t.monthlyReport;
  if (report === "signed-out") return <EmptyState icon={CalendarDays} title={copy.title} description={copy.signedOutText} />;
  if (!report) return <EmptyState icon={CalendarDays} title={copy.emptyTitle} description={copy.emptyText} />;

  const units = t.progress.measurements.units;
  const monthName = formatMonth(locale, report.month);
  const signed = (kind: MeasurementKind, change: number) => {
    const text = formatMeasurement(locale, kind, Math.abs(change), units);
    return change === 0 ? text : `${change < 0 ? MINUS : "+"}${text}`;
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1 px-4">
        <h2 className="text-title-3 font-semibold first-letter:uppercase">{monthName}</h2>
        <p className="text-footnote text-ink-2">{copy.private}</p>
      </div>

      {report.sessions || report.workouts ? (
        <ListGroup header={copy.sessions.header}>
          {report.sessions && report.sessions.trainers.length > 1 ? (
            <ListRow icon={CalendarCheck} title={copy.sessions.total} value={plural(locale, report.sessions.total, copy.sessions.count)} />
          ) : null}
          {report.sessions?.trainers.map((trainer) => (
            <ListRow
              key={trainer.coaching_id}
              avatar={{ name: trainer.name ?? copy.sessions.unnamed }}
              title={trainer.name ?? copy.sessions.unnamed}
              value={plural(locale, trainer.count, copy.sessions.count)}
            />
          ))}
          {report.workouts ? (
            <ListRow icon={Dumbbell} title={copy.workouts.title} value={plural(locale, report.workouts, copy.workouts.count)} />
          ) : null}
        </ListGroup>
      ) : null}

      {report.records?.length ? (
        <ListGroup header={copy.records}>
          {report.records.map((record) => (
            <ListRow
              key={`${record.exercise_id}-${record.type}`}
              icon={Trophy}
              title={record.name}
              subtitle={t.workouts.logs.recordTypes[record.type]}
              value={formatRecord(t, locale, record, weightUnit(locale))}
            />
          ))}
        </ListGroup>
      ) : null}

      {report.measurements?.length ? (
        <ListGroup header={copy.measurements.header}>
          {report.measurements.map((entry) => (
            <ListRow
              key={entry.kind}
              icon={Ruler}
              title={t.progress.measurements.kinds[entry.kind]}
              subtitle={interpolate(copy.measurements.range, {
                from: formatMeasurement(locale, entry.kind, entry.from, units),
                to: formatMeasurement(locale, entry.kind, entry.to, units),
              })}
              value={signed(entry.kind, Math.round((entry.to - entry.from) * 100) / 100)}
            />
          ))}
        </ListGroup>
      ) : null}

      {report.nutrition ? (
        <ListGroup header={copy.nutrition.header}>
          <ListRow icon={Utensils} title={copy.nutrition.logged} value={formatNumber(locale, report.nutrition.logged_days)} />
          {report.nutrition.target_days ? (
            <ListRow
              icon={Utensils}
              title={copy.nutrition.onTarget}
              value={interpolate(copy.nutrition.ofTarget, { done: report.nutrition.on_target_days, total: report.nutrition.target_days })}
            />
          ) : null}
        </ListGroup>
      ) : null}

      {report.steps || report.sleep ? (
        <ListGroup header={copy.activity.header}>
          {report.steps ? (
            <ListRow
              icon={Footprints}
              title={copy.activity.steps}
              subtitle={plural(locale, report.steps.days, copy.activity.days)}
              value={formatNumber(locale, report.steps.average)}
            />
          ) : null}
          {report.sleep ? (
            <ListRow
              icon={Moon}
              title={copy.activity.sleep}
              subtitle={plural(locale, report.sleep.days, copy.activity.days)}
              value={formatSleep(report.sleep.average_min, copy.activity.units)}
            />
          ) : null}
        </ListGroup>
      ) : null}

      {report.homework ? (
        <ListGroup header={copy.homework.header}>
          <ListRow
            icon={ClipboardCheck}
            title={copy.homework.done}
            value={interpolate(copy.homework.ofTotal, { done: report.homework.done, total: report.homework.total })}
          />
        </ListGroup>
      ) : null}

      <StoryCards month={monthParam(report.month)} options={storyOptions(report)} />
    </div>
  );
}
