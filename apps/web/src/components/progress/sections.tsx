import { EyeOff, Ruler } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { getDictionary, getLocale } from "@/i18n/server";
import { interpolate } from "@/i18n/format";
import { loadMyMeasurements, loadMyMilestones, loadPairMeasurements, loadTrainerMilestones, type Measurements } from "@/lib/progress/load";
import { MeasurementChart } from "./measurement-chart";
import { AddMeasurement } from "./measurement-form";
import { MeasurementHistory } from "./measurement-history";
import { MilestoneGroup } from "./milestones";

/** The chart, the "Добавить замер" button and, on the full screen, the history; an empty state before the first entry. */
function MeasurementsBlock({
  measurements,
  coachingId,
  full,
  emptyText,
  allHref,
  copy,
}: {
  measurements: Measurements;
  coachingId?: string;
  full: boolean;
  emptyText: string;
  allHref?: string;
  copy: { title: string; emptyTitle: string; all: string };
}) {
  const add = <AddMeasurement today={measurements.today} coachingId={coachingId} />;
  if (!measurements.entries.length) {
    return <EmptyState icon={Ruler} title={copy.emptyTitle} description={emptyText} action={add} headingLevel={full ? 2 : 3} />;
  }
  return (
    <section className="flex flex-col gap-3" aria-label={copy.title}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4">
        {full ? null : <h2 className="text-headline">{copy.title}</h2>}
        {add}
      </div>
      <MeasurementChart entries={measurements.entries} today={measurements.today} />
      {full ? (
        <MeasurementHistory entries={measurements.entries} today={measurements.today} />
      ) : allHref ? (
        <Link href={allHref} className="px-4 text-footnote font-semibold text-accent-ink">
          {copy.all}
        </Link>
      ) : null}
    </section>
  );
}

/** The client's measurements: a chart on "Прогресс", everything on "Замеры" (PRD wave-1 §2.11-1, 2.11-2). */
export async function ClientMeasurements({ full = false }: { full?: boolean }) {
  const [t, measurements] = await Promise.all([getDictionary(), loadMyMeasurements()]);
  const copy = t.progress.measurements;
  if (!measurements) return <EmptyState icon={Ruler} title={copy.signedOut} />;
  return (
    <MeasurementsBlock
      measurements={measurements}
      full={full}
      emptyText={copy.emptyText}
      allHref="/client/progress/measurements"
      copy={copy}
    />
  );
}

/** Milestones of each live pair of the client, one group per trainer. Nothing without a trainer. */
export async function ClientMilestones() {
  const [t, locale, items] = await Promise.all([getDictionary(), getLocale(), loadMyMilestones()]);
  const copy = t.progress.milestones;
  return items.map((item) => (
    <MilestoneGroup
      key={item.coachingId}
      t={t}
      locale={locale}
      item={item}
      header={item.partnerName ? interpolate(copy.withTrainer, { name: item.partnerName }) : copy.unnamedTrainer}
    />
  ));
}

/**
 * "Прогресс" on the trainer's client card: the client's measurements while they share them, and the pair's
 * milestones. A closed share shows one quiet line and no button to ask (screens.md).
 */
export async function TrainerProgress({ coachingId }: { coachingId: string }) {
  const [t, locale, measurements, milestones] = await Promise.all([
    getDictionary(),
    getLocale(),
    loadPairMeasurements(coachingId),
    loadTrainerMilestones(coachingId),
  ]);
  const copy = t.progress.measurements;
  return (
    <div className="flex flex-col gap-6">
      {!measurements || measurements.state === "closed" ? (
        <EmptyState icon={EyeOff} title={copy.closedTitle} description={copy.closedText} />
      ) : (
        <MeasurementsBlock
          measurements={measurements.measurements}
          coachingId={coachingId}
          full
          emptyText={copy.trainerEmptyText}
          copy={copy}
        />
      )}
      {milestones ? <MilestoneGroup t={t} locale={locale} item={milestones} header={t.progress.milestones.title} /> : null}
    </div>
  );
}
