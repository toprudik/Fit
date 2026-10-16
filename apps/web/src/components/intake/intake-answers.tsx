import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Dictionary } from "@/i18n/dictionaries";
import { INTAKE_TEXT_FIELDS, PARQ_QUESTIONS } from "@/lib/intake/form";
import type { IntakeVersion } from "@/lib/intake/load";
import { cn } from "@/lib/utils";

function Section({
  title,
  changed,
  changedLabel,
  children,
}: {
  title: string;
  changed: boolean;
  changedLabel: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 px-4">
        <h2 className="text-footnote text-ink-2">{title}</h2>
        {changed ? <Badge tone="accent">{changedLabel}</Badge> : null}
      </div>
      <div className="rounded-lg bg-surface-1 px-4 py-3">{children}</div>
    </section>
  );
}

/** "PAR-Q: есть «да»" with what it means for the trainer (PRD wave-1 §2.4 rule 3). */
export function ParqFlag({ t }: { t: Dictionary }) {
  const copy = t.intake.trainer;
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-danger-soft p-4">
      <Badge tone="danger" icon={AlertTriangle} className="self-start">
        {copy.parqFlag}
      </Badge>
      <p className="text-subhead">{copy.parqFlagText}</p>
    </div>
  );
}

/**
 * One version of the intake as the trainer reads it: goals, the health sections and PAR-Q with every "да"
 * highlighted. Sections changed since the trainer's last look carry "Изменено" (PRD 2.4-5).
 */
export function IntakeAnswers({ t, intake, changed }: { t: Dictionary; intake: IntakeVersion; changed: Set<string> }) {
  const copy = t.intake;
  const { answers, parq } = intake;
  const text = (value: string | null) =>
    value ? <p className="text-body whitespace-pre-line">{value}</p> : <p className="text-body text-ink-2">{copy.trainer.notSet}</p>;

  return (
    <div className="flex flex-col gap-6">
      <Section title={copy.form.steps.goals} changed={changed.has("goals")} changedLabel={copy.trainer.changed}>
        <div className="flex flex-col gap-3">
          {answers.goals.length ? (
            <ul className="flex flex-wrap gap-2">
              {answers.goals.map((goal) => (
                <li key={goal} className="rounded-full bg-surface-2 px-3 py-1 text-footnote">
                  {copy.form.goals[goal]}
                </li>
              ))}
            </ul>
          ) : null}
          {answers.goal_note ? <p className="text-body whitespace-pre-line">{answers.goal_note}</p> : null}
        </div>
      </Section>

      {INTAKE_TEXT_FIELDS.map((field) => (
        <Section key={field} title={copy.form.fields[field]} changed={changed.has(field)} changedLabel={copy.trainer.changed}>
          {text(answers[field])}
        </Section>
      ))}

      <section className="flex flex-col gap-1.5">
        <h2 className="px-4 text-footnote text-ink-2">{copy.form.steps.parq}</h2>
        <ol className="overflow-hidden rounded-lg bg-surface-1">
          {PARQ_QUESTIONS.map((question) => {
            const answer = parq[question];
            return (
              <li
                key={question}
                className={cn(
                  "flex flex-col gap-1.5 border-line px-4 py-3 not-first:border-t",
                  answer === true && "bg-danger-soft",
                )}
              >
                <p className="text-subhead">{copy.form.parq[question]}</p>
                <div className="flex items-center gap-2">
                  <span className={cn("text-headline", answer === true ? "text-danger" : answer === undefined && "text-ink-2")}>
                    {answer === undefined ? copy.trainer.noAnswer : answer ? copy.form.yes : copy.form.no}
                  </span>
                  {changed.has(question) ? <Badge tone="accent">{copy.trainer.changed}</Badge> : null}
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
