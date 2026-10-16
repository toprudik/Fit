"use client";

import { AlertTriangle, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChipCheckbox } from "@/components/ui/chip";
import { TextArea } from "@/components/ui/text-area";
import { useI18n } from "@/i18n/client";
import { interpolate } from "@/i18n/format";
import { submitIntake, type SubmitIntakeState } from "@/lib/intake/actions";
import {
  INTAKE_GOALS,
  INTAKE_STEPS,
  INTAKE_TEXT_FIELDS,
  INTAKE_TEXT_MAX,
  PARQ_QUESTIONS,
  stepOf,
  type IntakeValues,
  type ParqQuestion,
} from "@/lib/intake/form";
import { clientPairPath } from "@/lib/intake/paths";
import { hapticSuccess } from "@/lib/telegram/mini-app";
import { cn } from "@/lib/utils";

const IDLE: SubmitIntakeState = { status: "idle" };

/** "Да" / "Нет" for one PAR-Q question: real radio buttons, the chosen one inverse like a chip. */
function YesNo({ question, label, defaultValue, error, onAnswer }: {
  question: ParqQuestion;
  label: string;
  defaultValue: string;
  error?: string;
  onAnswer: (question: ParqQuestion, yes: boolean) => void;
}) {
  const { t } = useI18n();
  const errorId = `${question}-error`;
  return (
    <fieldset className="flex flex-col gap-2.5" aria-describedby={error ? errorId : undefined}>
      <legend className="mb-2.5 text-body">{label}</legend>
      <div className="flex gap-2">
        {(["yes", "no"] as const).map((answer) => (
          <label key={answer} className="relative inline-flex flex-1 cursor-pointer">
            <input
              type="radio"
              name={question}
              value={answer}
              defaultChecked={defaultValue === answer}
              onChange={() => onAnswer(question, answer === "yes")}
              className="peer absolute inset-0 size-full cursor-pointer appearance-none rounded-sm"
            />
            <span
              className={cn(
                "pointer-events-none inline-flex h-11 w-full items-center justify-center rounded-sm bg-surface-2 text-subhead font-semibold text-ink",
                "transition-[background-color] duration-[var(--duration-instant)] motion-reduce:transition-none",
                "peer-checked:bg-inverse peer-checked:text-on-inverse peer-hover:not-peer-checked:bg-surface-3",
                "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus-ring",
              )}
            >
              {answer === "yes" ? t.intake.form.yes : t.intake.form.no}
            </span>
          </label>
        ))}
      </div>
      {error ? (
        <p id={errorId} className="text-footnote text-danger">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

/**
 * The intake step by step (screens.md "Анкета клиента"): goals, health, PAR-Q. All steps sit in one form,
 * so "Отправить тренеру" sends every answer; hidden steps keep what was typed. Any "да" in PAR-Q shows the
 * doctor recommendation at once (INTK-3).
 */
export function IntakeForm({ coachingId, initial }: { coachingId: string; initial: IntakeValues | null }) {
  const { t } = useI18n();
  const copy = t.intake.form;
  const [state, action, pending] = useActionState(submitIntake, IDLE);
  const values = state.status === "invalid" || state.status === "failed" ? state.values : initial;
  const fields = state.status === "invalid" ? state.fields : [];
  const [step, setStep] = useState(0);
  const [yes, setYes] = useState<Set<ParqQuestion>>(
    () => new Set(PARQ_QUESTIONS.filter((question) => initial?.[question] === "yes")),
  );
  const top = useRef<HTMLDivElement>(null);

  // A rejected form opens on the step of the first problem, and the yes set follows the answers sent back.
  const [handled, setHandled] = useState(state);
  if (handled !== state) {
    setHandled(state);
    if (state.status === "invalid") {
      setStep(INTAKE_STEPS.indexOf(stepOf(state.fields[0] ?? "goals")));
      setYes(new Set(PARQ_QUESTIONS.filter((question) => state.values[question] === "yes")));
    }
  }

  useEffect(() => {
    if (state.status === "sent") hapticSuccess();
  }, [state]);

  useEffect(() => {
    top.current?.scrollIntoView({ block: "start" });
  }, [step]);

  if (state.status === "sent") {
    return (
      <div className="flex flex-col items-center gap-4 py-10 text-center">
        <CheckCircle2 aria-hidden size={40} strokeWidth={1.75} className="text-success" />
        <h2 className="text-title-3">{copy.sentTitle}</h2>
        <p className="max-w-[300px] text-subhead text-ink-2">{copy.sentText}</p>
        {state.flagged ? <p className="max-w-[320px] rounded-lg bg-danger-soft p-4 text-subhead">{copy.doctor}</p> : null}
        <Button asChild size="lg" block className="max-w-sm">
          <Link href={clientPairPath(coachingId)}>{copy.backToTrainer}</Link>
        </Button>
      </div>
    );
  }

  const error = (field: string) => fields.includes(field);
  const current = INTAKE_STEPS[step];
  const last = step === INTAKE_STEPS.length - 1;
  const answer = (question: ParqQuestion, isYes: boolean) =>
    setYes((before) => {
      const next = new Set(before);
      if (isYes) next.add(question);
      else next.delete(question);
      return next;
    });

  return (
    // key: React resets a form after its action, so a rejected one remounts with what was sent as defaults.
    <form key={JSON.stringify(state)} action={action} noValidate className="flex flex-1 flex-col gap-6">
      <div ref={top} className="flex scroll-mt-24 flex-col gap-1">
        <p className="text-footnote text-ink-2">{interpolate(copy.progress, { step: step + 1, total: INTAKE_STEPS.length })}</p>
        <h2 className="text-title-3">{copy.steps[current]}</h2>
      </div>

      <div hidden={current !== "goals"} className="flex flex-col gap-5">
        <fieldset className="flex flex-col gap-2" aria-describedby={error("goals") ? "goals-error" : undefined}>
          <legend className="mb-2 px-1 text-footnote text-ink-2">{copy.goalsLabel}</legend>
          <div className="flex flex-wrap gap-2">
            {INTAKE_GOALS.map((goal) => (
              <ChipCheckbox key={goal} name="goals" value={goal} defaultChecked={values?.goals.includes(goal) ?? false}>
                {copy.goals[goal]}
              </ChipCheckbox>
            ))}
          </div>
          {error("goals") ? (
            <p id="goals-error" className="px-1 text-footnote text-danger">
              {copy.goalsError}
            </p>
          ) : null}
        </fieldset>
        <TextArea
          name="goal_note"
          label={copy.goalNote}
          hint={copy.goalNoteHint}
          rows={3}
          maxLength={INTAKE_TEXT_MAX}
          defaultValue={String(values?.goal_note ?? "")}
          error={error("goal_note") ? copy.textError : undefined}
        />
      </div>

      <div hidden={current !== "health"} className="flex flex-col gap-5">
        {INTAKE_TEXT_FIELDS.map((field) => (
          <TextArea
            key={field}
            name={field}
            label={copy.fields[field]}
            hint={copy.fieldHint}
            rows={3}
            maxLength={INTAKE_TEXT_MAX}
            defaultValue={String(values?.[field] ?? "")}
            error={error(field) ? copy.textError : undefined}
          />
        ))}
      </div>

      <div hidden={current !== "parq"} className="flex flex-col gap-6">
        <p className="text-subhead text-ink-2">{copy.parqText}</p>
        {PARQ_QUESTIONS.map((question) => (
          <YesNo
            key={question}
            question={question}
            label={copy.parq[question]}
            defaultValue={String(values?.[question] ?? "")}
            error={error(question) ? copy.parqError : undefined}
            onAnswer={answer}
          />
        ))}
        {yes.size > 0 ? (
          <div role="status" className="flex gap-3 rounded-lg bg-danger-soft p-4">
            <AlertTriangle aria-hidden size={20} strokeWidth={2} className="mt-0.5 shrink-0 text-danger" />
            <p className="text-subhead">{copy.doctor}</p>
          </div>
        ) : null}
      </div>

      {state.status === "failed" ? (
        <p role="alert" className="text-subhead text-danger">
          {copy.failed}
        </p>
      ) : null}

      <div className="mt-auto flex flex-col gap-3">
        {last ? (
          <Button type="submit" size="lg" block loading={pending}>
            {copy.submit}
          </Button>
        ) : (
          <Button type="button" size="lg" block onClick={() => setStep(step + 1)}>
            {copy.next}
          </Button>
        )}
        {step > 0 ? (
          <Button type="button" variant="secondary" size="lg" block onClick={() => setStep(step - 1)} disabled={pending}>
            {copy.back}
          </Button>
        ) : null}
        <Button asChild variant="ghost" size="lg" block>
          <Link href={clientPairPath(coachingId)}>{copy.later}</Link>
        </Button>
      </div>
    </form>
  );
}
