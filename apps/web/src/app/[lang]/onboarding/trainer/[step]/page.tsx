import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { StepFields } from "@/components/trainer-wizard/step-fields";
import { WizardScreen, WizardSkeleton } from "@/components/trainer-wizard/wizard-screen";
import { Button } from "@/components/ui/button";
import { interpolate } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import { loadWizard } from "@/lib/trainer-wizard/load";
import { isWizardStep, previousPath, stepNumber, stepPath, WIZARD_STEPS, type WizardStep } from "@/lib/trainer-wizard/steps";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.trainerWizard.title };
}

async function StepContent({ step }: { step: WizardStep }) {
  const [t, locale, wizard] = await Promise.all([getDictionary(), getLocale(), loadWizard()]);
  if (wizard.status === "not-trainer") redirect("/onboarding/trainer");
  if (wizard.status === "signed-out") {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-callout text-ink-2">{t.trainerWizard.signedOutText}</p>
        <Button asChild size="lg" block>
          <Link href={`/login?next=${encodeURIComponent(stepPath(step))}`}>{t.trainerWizard.signIn}</Link>
        </Button>
      </div>
    );
  }
  return <StepFields step={step} data={wizard.data} locale={locale} />;
}

async function StepScreen({ params }: { params: PageProps<"/[lang]/onboarding/trainer/[step]">["params"] }) {
  const { step } = await params;
  if (!isWizardStep(step)) notFound();
  const t = await getDictionary();
  const copy = t.trainerWizard.steps[step];
  const number = stepNumber(step);

  return (
    <WizardScreen
      stepLabel={interpolate(t.trainerWizard.stepOf, { step: number, total: WIZARD_STEPS.length })}
      progress={(number - 1) / WIZARD_STEPS.length}
      progressLabel={t.trainerWizard.progress}
      back={previousPath(step)}
      title={copy.title}
      text={copy.text}
    >
      <StepContent step={step} />
    </WizardScreen>
  );
}

/**
 * One step of the trainer profile wizard (screens.md §3.1, flow 4.1 step 6). The step comes from the
 * URL and the form from the trainer's saved answers, so the whole screen streams in behind a skeleton.
 */
export default function TrainerWizardStepPage({ params }: PageProps<"/[lang]/onboarding/trainer/[step]">) {
  return (
    <Suspense fallback={<WizardSkeleton />}>
      <StepScreen params={params} />
    </Suspense>
  );
}
