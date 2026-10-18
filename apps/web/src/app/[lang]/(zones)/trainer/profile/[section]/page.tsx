import type { Metadata } from "next";
import { UserRound } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { StepFields } from "@/components/trainer-wizard/step-fields";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonRows } from "@/components/ui/skeleton";
import { getDictionary, getLocale } from "@/i18n/server";
import { loadWizard } from "@/lib/trainer-wizard/load";
import { editPath, isEditableStep, PROFILE_EDIT_PATH } from "@/lib/trainer-wizard/steps";

// The section comes from the URL, so the page renders on request.
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.trainerWizard.edit.title };
}

async function Section({ params }: { params: PageProps<"/[lang]/trainer/profile/[section]">["params"] }) {
  const [{ section }, t, locale, wizard] = await Promise.all([params, getDictionary(), getLocale(), loadWizard()]);
  if (!isEditableStep(section)) notFound();
  const copy = t.trainerWizard.edit;
  if (wizard.status === "signed-out") {
    return (
      <EmptyState
        icon={UserRound}
        title={copy.title}
        description={copy.signedOutText}
        action={
          <Button asChild>
            <Link href={`/login?next=${encodeURIComponent(editPath(section))}`}>{t.trainerWizard.signIn}</Link>
          </Button>
        }
      />
    );
  }
  if (wizard.status === "not-trainer") return <EmptyState icon={UserRound} title={copy.title} description={copy.notTrainer} />;

  const step = t.trainerWizard.steps[section];
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-title-2">{step.title}</h2>
        <p className="text-callout text-ink-2">{step.text}</p>
      </div>
      <StepFields step={section} data={wizard.data} locale={locale} edit />
    </div>
  );
}

/**
 * One section of "Профиль тренера" (PRD wave-1 §2.3): the wizard step's form with the saved answers.
 * "Сохранить" goes back to the list of sections; places are changed right in their list.
 */
export default async function TrainerProfileSectionPage({ params }: PageProps<"/[lang]/trainer/profile/[section]">) {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.trainerWizard.edit.title} back={{ fallbackHref: PROFILE_EDIT_PATH }} />}>
      <div className="flex w-full max-w-2xl flex-col gap-6 pt-4 md:pt-0">
        <Suspense fallback={<SkeletonRows rows={3} label={t.common.loading} />}>
          <Section params={params} />
        </Suspense>
      </div>
    </Screen>
  );
}
