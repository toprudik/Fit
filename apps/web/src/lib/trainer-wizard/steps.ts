/**
 * The trainer profile wizard (screens.md §3.1 and flow 4.1, PRD wave-1 §2.3): one screen per step,
 * /onboarding/trainer/<step>, then /onboarding/trainer/done. "Далее" saves the step, so a trainer who
 * leaves halfway keeps what they filled in. The price grid step joins with packages in week 2.
 */
export const WIZARD_STEPS = ["profile", "format", "locations", "region", "cancellation", "payment", "certificates"] as const;

export type WizardStep = (typeof WIZARD_STEPS)[number];

export const WIZARD_DONE_PATH = "/onboarding/trainer/done";

/** Where redeeming an invite and "Заполнить профиль" lead. */
export const WIZARD_START_PATH = stepPath(WIZARD_STEPS[0]);

export function isWizardStep(value: string): value is WizardStep {
  return (WIZARD_STEPS as readonly string[]).includes(value);
}

export function stepPath(step: WizardStep): string {
  return `/onboarding/trainer/${step}`;
}

/** The screen after `step`: the next step, or the result screen after the last one. */
export function nextPath(step: WizardStep): string {
  const next = WIZARD_STEPS[WIZARD_STEPS.indexOf(step) + 1];
  return next ? stepPath(next) : WIZARD_DONE_PATH;
}

/** The screen before `step`, or null on the first one. */
export function previousPath(step: WizardStep): string | null {
  const previous = WIZARD_STEPS[WIZARD_STEPS.indexOf(step) - 1];
  return previous ? stepPath(previous) : null;
}

/** 1-based number of the step, for "Шаг 2 из 7" and the progress bar. */
export function stepNumber(step: WizardStep): number {
  return WIZARD_STEPS.indexOf(step) + 1;
}

/** Steps with nothing the trainer must fill in show "Пропустить". */
export const SKIPPABLE_STEPS: ReadonlySet<WizardStep> = new Set(["locations", "payment", "certificates"]);
