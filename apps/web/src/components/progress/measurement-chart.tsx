"use client";

import { useState } from "react";
import { Chip, ChipRow } from "@/components/ui/chip";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useI18n } from "@/i18n/client";
import { interpolate } from "@/i18n/format";
import { formatLogDay } from "@/lib/workouts/present";
import {
  dailySeries,
  formatChange,
  formatMeasurement,
  fromMetric,
  MEASUREMENT_KINDS,
  periodStart,
  unitOf,
  unitSystem,
  type MeasurementKind,
  type Period,
} from "@/lib/progress/measurements";

export type ChartEntry = {
  kind: MeasurementKind;
  value: number;
  date: string;
  at: string;
};

const WIDTH = 320;
const HEIGHT = 120;
const PAD = 12;

function dayNumber(day: string): number {
  const [year, month, date] = day.split("-").map(Number);
  return Date.UTC(year, month - 1, date) / 86_400_000;
}

/**
 * The chart of one measurement over a month, three months or all time (PRD wave-1 §2.11-2). The line is
 * backed by a sentence with the first and last values and the change, so the trend reads without the picture.
 */
export function MeasurementChart({
  entries,
  today,
}: {
  entries: ChartEntry[];
  today: string;
}) {
  const { t, locale } = useI18n();
  const copy = t.progress.measurements;
  const kinds = MEASUREMENT_KINDS.filter((kind) =>
    entries.some((entry) => entry.kind === kind),
  );
  const [kind, setKind] = useState<MeasurementKind>(kinds[0] ?? "weight");
  const [period, setPeriod] = useState<Period>("quarter");
  const shown = kinds.includes(kind) ? kind : (kinds[0] ?? "weight");

  const start = periodStart(period, today);
  const points = dailySeries(
      entries.filter(
        (entry) => entry.kind === shown && (!start || entry.date >= start),
      ),
    );

  const unit = unitOf(shown, unitSystem(locale));
  const format = (metric: number) =>
    formatMeasurement(locale, shown, metric, copy.units);
  const first = points[0];
  const last = points.at(-1);

  let summary = copy.noPoints;
  if (first && last && points.length === 1)
    summary = interpolate(copy.single, { value: format(last.value) });
  else if (first && last) {
    summary = `${interpolate(copy.summary, { from: format(first.value), to: format(last.value) })}. ${interpolate(
      copy.change,
      {
        change: formatChange(
          locale,
          shown,
          first.value,
          last.value,
          copy.units,
        ),
      },
    )}`;
  }

  const values = points.map((point) => fromMetric(point.value, unit));
  const low = Math.min(...values);
  const high = Math.max(...values);
  const spread = high - low || 1;
  const startDay = first ? dayNumber(first.date) : 0;
  const days = last && first ? dayNumber(last.date) - startDay || 1 : 1;
  const coords = points.map((point, index) => ({
    x:
      points.length === 1
        ? WIDTH / 2
        : PAD + ((dayNumber(point.date) - startDay) / days) * (WIDTH - PAD * 2),
    y: PAD + (1 - (values[index] - low) / spread) * (HEIGHT - PAD * 2),
  }));
  const thisYear = Number(today.slice(0, 4));

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-surface-1 p-4">
      {kinds.length > 1 ? (
        <ChipRow label={copy.kindLabel}>
          {kinds.map((option) => (
            <Chip
              key={option}
              selected={option === shown}
              onClick={() => setKind(option)}
            >
              {copy.kinds[option]}
            </Chip>
          ))}
        </ChipRow>
      ) : (
        <h3 className="text-headline">{copy.kinds[shown]}</h3>
      )}
      <SegmentedControl
        label={copy.periodLabel}
        value={period}
        onValueChange={setPeriod}
        options={(["month", "quarter", "all"] as const).map((value) => ({
          value,
          label: copy.periods[value],
        }))}
      />
      <p className="text-subhead text-ink-2" aria-live="polite">
        {summary}
      </p>
      {points.length ? (
        <figure className="flex flex-col gap-1">
          <div className="relative h-32 w-full">
            <svg
              viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
              className="absolute inset-0 size-full overflow-visible"
              preserveAspectRatio="none"
              role="img"
              aria-label={`${interpolate(copy.chartLabel, { kind: copy.kinds[shown] })}. ${summary}`}
            >
              <line
                x1={0}
                x2={WIDTH}
                y1={HEIGHT - PAD}
                y2={HEIGHT - PAD}
                className="stroke-line"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
              {coords.length > 1 ? (
                <polyline
                  points={coords.map(({ x, y }) => `${x},${y}`).join(" ")}
                  fill="none"
                  className="stroke-accent"
                  strokeWidth={2.5}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              ) : null}
            </svg>
            {/* Dots drawn in HTML over the SVG stay round however the chart is stretched. */}
            {coords.map(({ x, y }, index) => (
              <span
                key={points[index].date}
                className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent ring-2 ring-surface-1"
                style={{
                  left: `${(x / WIDTH) * 100}%`,
                  top: `${(y / HEIGHT) * 100}%`,
                }}
                aria-hidden
              />
            ))}
          </div>
          <figcaption
            aria-hidden
            className="flex justify-between text-footnote text-ink-2 tabular-nums"
          >
            <span>
              {first ? formatLogDay(locale, first.date, thisYear) : null}
            </span>
            <span>
              {last && points.length > 1
                ? formatLogDay(locale, last.date, thisYear)
                : null}
            </span>
          </figcaption>
        </figure>
      ) : null}
    </div>
  );
}
