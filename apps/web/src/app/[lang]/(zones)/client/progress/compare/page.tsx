import type { Metadata } from "next";
import { Camera } from "lucide-react";
import { Suspense } from "react";
import { CompareView } from "@/components/progress/compare";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonRows } from "@/components/ui/skeleton";
import { getDictionary, getLocale } from "@/i18n/server";
import { interpolate } from "@/i18n/format";
import { loadMyMeasurements } from "@/lib/progress/load";
import { formatMeasurement } from "@/lib/progress/measurements";
import { datesByAngle, loadMyPhotos } from "@/lib/progress/photo-load";
import { isPhotoAngle, PHOTO_ANGLES } from "@/lib/progress/photos";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.progress.compare.title };
}

async function Compare({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [t, locale, search, photos, measurements] = await Promise.all([getDictionary(), getLocale(), searchParams, loadMyPhotos(), loadMyMeasurements()]);
  const copy = t.progress.compare;
  if (!photos) return <EmptyState icon={Camera} title={t.progress.photos.signedOut} />;
  const dates = datesByAngle(photos.sets);
  const angles = PHOTO_ANGLES.filter((angle) => dates[angle].length >= 2);
  if (!angles.length) return <EmptyState icon={Camera} title={copy.title} description={copy.need} />;
  const angle = isPhotoAngle(search.angle) && angles.includes(search.angle) ? search.angle : angles[0];
  const options = dates[angle];
  const pick = (value: unknown, fallback: string) => (typeof value === "string" && options.includes(value) ? value : fallback);
  const before = pick(search.before, options.at(-1)!);
  const after = pick(search.after, options[0]);
  const url = (date: string) => photos.sets.find((set) => set.date === date)!.photos[angle]!.url;

  // The weight on or before each date, else the first one after it, when there is any.
  const weights = (measurements?.entries ?? []).filter((entry) => entry.kind === "weight").sort((a, b) => (a.at < b.at ? -1 : 1));
  const weightAt = (date: string) => weights.findLast((entry) => entry.date <= date) ?? weights.find((entry) => entry.date > date);
  const from = weightAt(before);
  const to = weightAt(after);
  const weight =
    from && to && from.id !== to.id
      ? interpolate(copy.weight, {
          from: formatMeasurement(locale, "weight", from.value, t.progress.measurements.units),
          to: formatMeasurement(locale, "weight", to.value, t.progress.measurements.units),
        })
      : null;

  return (
    <CompareView
      angle={angle}
      angles={angles}
      dates={options}
      before={{ date: before, url: url(before) }}
      after={{ date: after, url: url(after) }}
      today={photos.today}
      weight={weight}
    />
  );
}

/** "До и после": `?angle=&before=&after=` pick the angle and the two dates (PROG-7). */
export default async function ComparePage(props: PageProps<"/[lang]/client/progress/compare">) {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.progress.compare.title} back={{ fallbackHref: "/client/progress/photos" }} />}>
      <div className="flex w-full max-w-2xl flex-col gap-6 pt-4 md:pt-0">
        <Suspense fallback={<SkeletonRows rows={3} label={t.common.loading} />}>
          <Compare searchParams={props.searchParams} />
        </Suspense>
      </div>
    </Screen>
  );
}
