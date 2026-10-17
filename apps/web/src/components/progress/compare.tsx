"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Chip, ChipRow } from "@/components/ui/chip";
import { useI18n } from "@/i18n/client";
import type { PhotoAngle } from "@/lib/progress/photos";
import { formatLogDay } from "@/lib/workouts/present";

type Side = { date: string; url: string };

/**
 * "До и после" (PRD wave-1 §2.11-8, PROG-7): two photos of one angle on chosen dates, laid over each other with
 * a divider the client drags. The choices live in the URL, so a reload keeps them.
 */
export function CompareView({
  angle,
  angles,
  dates,
  before,
  after,
  today,
  weight,
}: {
  angle: PhotoAngle;
  /** Angles that have at least two dates. */
  angles: PhotoAngle[];
  /** Dates with a photo of this angle, newest first. */
  dates: string[];
  before: Side;
  after: Side;
  today: string;
  weight: string | null;
}) {
  const { t, locale } = useI18n();
  const copy = t.progress.compare;
  const router = useRouter();
  const [split, setSplit] = useState(50);
  const thisYear = Number(today.slice(0, 4));
  const day = (date: string) => formatLogDay(locale, date, thisYear);
  const go = (next: { angle?: PhotoAngle; before?: string; after?: string }) => {
    const params = new URLSearchParams({ angle: next.angle ?? angle });
    if (!next.angle) {
      params.set("before", next.before ?? before.date);
      params.set("after", next.after ?? after.date);
    }
    router.replace(`/client/progress/compare?${params}`, { scroll: false });
  };

  const select = (label: string, value: string, onChange: (value: string) => void) => (
    <label className="flex flex-1 flex-col gap-1.5">
      <span className="px-1 text-footnote text-ink-2">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-13 rounded-sm border border-field-line bg-field px-3 text-body text-ink"
      >
        {dates.map((date) => (
          <option key={date} value={date}>
            {day(date)}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="flex flex-col gap-4">
      {angles.length > 1 ? (
        <ChipRow label={copy.angleLabel}>
          {angles.map((option) => (
            <Chip key={option} selected={option === angle} onClick={() => go({ angle: option })}>
              {t.progress.photos.angles[option]}
            </Chip>
          ))}
        </ChipRow>
      ) : null}
      <div className="flex gap-3">
        {select(copy.before, before.date, (date) => go({ before: date }))}
        {select(copy.after, after.date, (date) => go({ after: date }))}
      </div>
      {weight ? <p className="px-1 text-subhead text-ink-2">{weight}</p> : null}
      <figure className="relative mx-auto w-full max-w-md overflow-hidden rounded-md bg-surface-2">
        {/* Signed Storage links that live five minutes; next/image would cache them. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={after.url} alt={`${copy.after}, ${day(after.date)}`} className="block w-full" />
        <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={before.url} alt={`${copy.before}, ${day(before.date)}`} className="size-full object-cover" />
        </div>
        <div aria-hidden className="absolute inset-y-0 w-0.5 bg-[#fff] shadow-[0_0_4px_rgb(0_0_0/0.5)]" style={{ left: `${split}%` }} />
        <span aria-hidden className="absolute top-2 left-2 rounded-full bg-[rgb(0_0_0/0.65)] px-2 py-0.5 text-footnote text-[#fff]">
          {copy.before}
        </span>
        <span aria-hidden className="absolute top-2 right-2 rounded-full bg-[rgb(0_0_0/0.65)] px-2 py-0.5 text-footnote text-[#fff]">
          {copy.after}
        </span>
      </figure>
      <input
        type="range"
        min={0}
        max={100}
        value={split}
        onChange={(event) => setSplit(Number(event.target.value))}
        aria-label={copy.slider}
        className="mx-auto w-full max-w-md accent-[var(--accent)]"
      />
    </div>
  );
}
