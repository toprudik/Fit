import { Copy, ExternalLink, Pencil, PlayCircle } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { interpolate } from "@/i18n/format";
import type { Dictionary } from "@/i18n/dictionaries/ru";
import { keyLabel, licenseLabel } from "@/lib/workouts/catalog";
import type { ExerciseDetails } from "@/lib/workouts/load";
import { ArchiveExercise } from "./archive-exercise";

function Chips({ labels }: { labels: string[] }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {labels.map((label) => (
        <li key={label}>
          <Badge>{label}</Badge>
        </li>
      ))}
    </ul>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="px-1 text-footnote text-ink-2">{title}</h2>
      {children}
    </section>
  );
}

/** wger credit under the card (PRD 2.10-2, WORK-1): "Источник: wger.de, CC-BY-SA 4.0" with a link, and the authors. */
export function Attribution({ t, attribution }: { t: Dictionary; attribution: NonNullable<ExerciseDetails["attribution"]> }) {
  const copy = t.workouts.card;
  const source = attribution.url ? (
    <a href={attribution.url} target="_blank" rel="noopener noreferrer" className="text-accent-ink underline underline-offset-2">
      wger.de
    </a>
  ) : (
    "wger.de"
  );
  const [before, after] = copy.source.split("{source}");
  return (
    <div className="flex flex-col gap-1 px-1 text-footnote [overflow-wrap:anywhere] text-ink-2">
      <p>
        {before}
        {source}
        {interpolate(after ?? "", { license: licenseLabel(attribution.license) })}
      </p>
      {attribution.authors ? <p>{interpolate(copy.authors, { authors: attribution.authors })}</p> : null}
    </div>
  );
}

/**
 * The card of one exercise: group, muscles, equipment, how to do it, the video link and the wger credit.
 * A trainer edits and archives an own exercise, and makes an own copy of any other (PRD 2.10-2).
 */
export function ExerciseCard({ t, exercise }: { t: Dictionary; exercise: ExerciseDetails }) {
  const copy = t.workouts.card;
  const muscles = exercise.musclesPrimary.map((key) => keyLabel(t.workouts.muscles, key));
  const secondary = exercise.musclesSecondary.map((key) => keyLabel(t.workouts.muscles, key));
  const equipment = exercise.equipment.map((key) => keyLabel(t.workouts.equipment, key));
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2 px-1">
        {exercise.category ? <Badge tone="accent">{keyLabel(t.workouts.categories, exercise.category)}</Badge> : null}
        {exercise.own ? <Badge>{t.workouts.library.ownBadge}</Badge> : null}
      </div>
      {exercise.archived ? <p className="px-1 text-callout text-ink-2">{copy.archived}</p> : null}
      {muscles.length ? (
        <Section title={copy.muscles}>
          <Chips labels={muscles} />
        </Section>
      ) : null}
      {secondary.length ? (
        <Section title={copy.secondary}>
          <Chips labels={secondary} />
        </Section>
      ) : null}
      {equipment.length ? (
        <Section title={copy.equipment}>
          <Chips labels={equipment} />
        </Section>
      ) : null}
      <Section title={copy.description}>
        <p className="px-1 text-body whitespace-pre-line">{exercise.description ?? copy.noDescription}</p>
      </Section>
      {exercise.videoUrl ? (
        <Section title={copy.video}>
          <Button asChild variant="secondary" icon={PlayCircle} block>
            <a href={exercise.videoUrl} target="_blank" rel="noopener noreferrer">
              {new URL(exercise.videoUrl).hostname.replace(/^www\./, "")}
              <ExternalLink aria-hidden size={16} />
            </a>
          </Button>
        </Section>
      ) : null}
      {exercise.viewerIsTrainer ? (
        <div className="flex flex-col gap-3">
          {exercise.own ? (
            <>
              <Button asChild icon={Pencil} block>
                <Link href={`/trainer/exercises/${exercise.id}/edit`}>{copy.edit}</Link>
              </Button>
              <ArchiveExercise id={exercise.id} archived={exercise.archived} />
            </>
          ) : (
            <Button asChild variant="secondary" icon={Copy} block>
              <Link href={`/trainer/exercises/new?from=${exercise.id}`}>{copy.copy}</Link>
            </Button>
          )}
        </div>
      ) : null}
      {exercise.attribution ? <Attribution t={t} attribution={exercise.attribution} /> : null}
    </div>
  );
}
