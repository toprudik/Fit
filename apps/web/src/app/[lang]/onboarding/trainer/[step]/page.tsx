import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import {
  CancellationForm,
  CertificatesForm,
  FormatForm,
  LocationsForm,
  PaymentForm,
  ProfileForm,
  RegionForm,
} from "@/components/trainer-wizard/step-forms";
import { WizardScreen, WizardSkeleton } from "@/components/trainer-wizard/wizard-screen";
import { Button } from "@/components/ui/button";
import { interpolate } from "@/i18n/format";
import { getDictionary } from "@/i18n/server";
import { loadWizard, type WizardData } from "@/lib/trainer-wizard/load";
import { timeZones } from "@/lib/trainer-wizard/options";
import { isWizardStep, previousPath, stepNumber, stepPath, WIZARD_STEPS, type WizardStep } from "@/lib/trainer-wizard/steps";

/** Where the last step sends documents: the verification screen (built with trainer verification). */
const CERTIFICATES_PATH = "/trainer/verification";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.trainerWizard.title };
}

/** "Europe/Moscow (GMT+3)", sorted as the runtime lists them. */
function zoneOptions(): { id: string; label: string }[] {
  const now = new Date();
  return timeZones().map((id) => {
    const offset = new Intl.DateTimeFormat("en-US", { timeZone: id, timeZoneName: "shortOffset" })
      .formatToParts(now)
      .find((part) => part.type === "timeZoneName")?.value;
    return { id, label: `${id.replaceAll("_", " ")}${offset ? ` (${offset})` : ""}` };
  });
}

function StepFields({ step, data }: { step: WizardStep; data: NonNullable<WizardData> }) {
  const { trainer } = data;
  switch (step) {
    case "profile":
      return <ProfileForm name={data.name} photoUrl={data.photoUrl} headline={trainer.headline ?? ""} bio={trainer.bio ?? ""} />;
    case "format":
      return (
        <FormatForm offline={trainer.works_offline} online={trainer.works_online} specialties={trainer.specialties} city={trainer.city ?? ""} />
      );
    case "locations":
      return <LocationsForm locations={data.locations} onlineOnly={!trainer.works_offline} />;
    case "region":
      return <RegionForm timeZone={data.timeZone} currency={trainer.default_currency} zones={zoneOptions()} />;
    case "cancellation":
      return <CancellationForm hours={trainer.cancellation_deadline_hours} />;
    case "payment":
      return <PaymentForm links={data.paymentLinks} />;
    case "certificates":
      return <CertificatesForm uploadHref={CERTIFICATES_PATH} />;
  }
}

async function StepContent({ step }: { step: WizardStep }) {
  const [t, wizard] = await Promise.all([getDictionary(), loadWizard()]);
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
  return <StepFields step={step} data={wizard.data} />;
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
